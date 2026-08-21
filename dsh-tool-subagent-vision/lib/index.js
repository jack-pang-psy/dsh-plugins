import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { settleRun } from "@deepseek-ai/dsh-subagent";
import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";
//#region lib/types/index.js
/**
* `dsh-tool-subagent-vision` — vision input for DeepSeek Harness:
*
* 1. IMAGE TRANSLATION (default): image-bearing prompts enter the session
*    history NORMALLY (the conversation UI shows the user's images; the
*    admission wrapper defers the api-proxy capability answer while they
*    do). At request time, the llm stream wrapper replaces image blocks
*    with their vision-model translation ("[图片后台识别结果] ...", default
*    opencode-go/qwen3.7-plus through the harness LLM service) whenever the
*    target model does not declare image input, so the MAIN MODEL never
*    changes route and only ever sees text. Translations are cached per
*    content-addressed attachment id: each image is translated once per
*    process, across turns and sessions; vision-capable models receive the
*    original image blocks untouched. Legacy sessions whose history already
*    contains images are covered by the same request-layer replacement.
*
* 2. `subagent_vision` TOOL: delegate image understanding to a vision-capable
*    subagent explicitly (the same vision model the translation uses), for
*    deep analysis of workspace files; the parent's route is untouched.
*
* Registered on the HOST plane, so all capabilities are visible to every
* preset and session in the profile.
* @module dsh-tool-subagent-vision
*/
const name = "tool-subagent-vision";
const inject = [
	"tools",
	"subagents",
	"systemPrompt",
	"llm",
	"apiProxy",
	"attachments"
];
const Config = z.object({
	// subagent_vision tool
	provider: z.string().required(),
	modelProvider: z.string().default("opencode-go"),
	model: z.string().default("qwen3.7-plus"),
	enableRunInBackground: z.boolean().default(true),
	// image translation (request-layer replacement -> text injection)
	translateImages: z.boolean().default(true),
	translateModelProvider: z.string().default("opencode-go"),
	translateModel: z.string().default("qwen3.7-plus"),
	translateTimeoutMs: z.number().default(120000)
});
/** The child's shadowing persona: vision analysis instructions (pi vision.md pattern). */
const VISION_PERSONA = `You are a vision-capable subagent. Your model route accepts image input, so you can read images with the read_image tool.

Your job is to analyze visual content (screenshots, photos, UI mockups, diagrams, charts, scanned documents) and report structured findings:

1. Describe what is in the image (objects, layout, text, colors, spacing, hierarchy).
2. Extract any visible text verbatim (UI labels, error messages, code in screenshots).
3. Answer the specific question asked about the image.
4. Note anything unclear, cropped, or low-quality that affects interpretation.

Always read the image with read_image first; never guess what you cannot see. If the requested file is not a PNG/JPEG/WebP/GIF image, say so instead of guessing.

Output format when finished:

## Visual Summary
What the image shows.

## Extracted Text
- Verbatim text found (labels, messages, code).

## Findings
Answers to the specific questions asked.

## Notes (if any)
Anything the delegating agent should know (uncertainty, missing parts).

Reply in the language of the delegating agent's request (default Chinese).`;
//#region automatic routing
/**
* Detect image blocks, including images nested inside tool results.
* @param content - a message content array (or any nested array).
* @returns whether an image block is present.
*/
export function contentHasImage(content) {
	return Array.isArray(content) && content.some((block) => block?.type === "image" || block?.type === "tool-result" && contentHasImage(block.content));
}
/**
* A prior image remains part of the model-visible context on later steps.
* @param messages - the derived message list.
* @returns whether any message carries an image block (anywhere).
*/
export function messagesHaveImage(messages) {
	return Array.isArray(messages) && messages.some((message) => contentHasImage(message?.content));
}
/** Vision-translation instruction sent to the vision model (structured output). */
const VISION_TRANSLATE_PROMPT = `You are a vision recognition engine. Analyze the attached image and answer the user's question if any.

Reply with STRICT JSON only — no markdown fences, no prose outside the JSON object. Use exactly this schema:
{
  "caption": "one-paragraph accurate description of what the image shows (objects, layout, colors, spacing, hierarchy)",
  "ocr": ["every visible text string, verbatim, in reading order (UI labels, error messages, code in screenshots); empty array if none"],
  "objects": [{"name": "visible element/control", "role": "its role or function", "location": "approximate position or spatial relation"}],
  "layout": "brief structural description of the composition (sections, alignment, grouping, flow)",
  "issues": ["any defects you can actually see: misalignment, overlap, blur, clipping, low contrast; empty array if none"],
  "answer": "the answer to the user's question, or an empty string if no question was asked",
  "uncertainty": ["anything unclear, cropped, or low-quality that affects interpretation; empty array if none"]
}

Be accurate and specific; never invent details you cannot see. If the image cannot be read, reply {"caption":"","ocr":[],"objects":[],"layout":"","issues":[],"answer":"","uncertainty":["image unreadable"]}.`;
/**
* Parse the vision model's reply into a structured translation object,
* tolerating the model's common JSON-formatting lapses (fences, stray
* prose). Falls back to a plain-text passthrough when no JSON is found.
* @param text - the raw vision-model reply.
* @returns a structured object with `caption`, `ocr`, `objects`, `layout`,
*   `issues`, `answer`, `uncertainty` fields (strings/arrays), plus the raw
*   `text` when the reply was not parseable as JSON.
*/
export function parseStructuredTranslation(text) {
	const trimmed = String(text ?? "").trim();
	const attempts = [trimmed];
	const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
	if (fenced) attempts.push(fenced[1].trim());
	const brace = trimmed.indexOf("{");
	if (brace > 0) attempts.push(trimmed.slice(brace));
	for (const candidate of attempts) {
		try {
			const parsed = JSON.parse(candidate);
			if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
		} catch {
			// try the next candidate
		}
	}
	return { caption: trimmed, ocr: [], objects: [], layout: "", issues: [], answer: "", uncertainty: [], _raw: trimmed };
}
/**
* Render a structured translation as the text injected into the main
* context: a compact human-readable summary for the model, plus the raw JSON
* for precision.
*/
export function renderStructuredTranslation(parsed) {
	const lines = [];
	if (parsed.caption) lines.push(`描述:${parsed.caption}`);
	if (Array.isArray(parsed.ocr) && parsed.ocr.length > 0) lines.push(`OCR:\n${parsed.ocr.map((t) => `  - ${t}`).join("\n")}`);
	if (Array.isArray(parsed.objects) && parsed.objects.length > 0) lines.push(`元素:${parsed.objects.map((o) => typeof o === "object" && o ? `${o.name ?? "?"}${o.role ? `(${o.role})` : ""}${o.location ? ` @ ${o.location}` : ""}` : String(o)).join("; ")}`);
	if (parsed.layout) lines.push(`布局:${parsed.layout}`);
	if (Array.isArray(parsed.issues) && parsed.issues.length > 0) lines.push(`问题:${parsed.issues.join("; ")}`);
	if (parsed.answer) lines.push(`回答:${parsed.answer}`);
	if (Array.isArray(parsed.uncertainty) && parsed.uncertainty.length > 0) lines.push(`不确定:${parsed.uncertainty.join("; ")}`);
	const summary = lines.join("\n");
	const { _raw, ...clean } = parsed;
	const json = JSON.stringify(clean);
	return summary.length < json.length ? `${summary}\n\`\`\`json\n${json}\n\`\`\`` : json;
}
/**
* Run one vision-model call through the harness LLM service and return the
* structured translation. Uses the official public API (prepareCall + stream
* + BlockAssembler).
* @param ctx - host context (llm injected).
* @param config - plugin config (translateModelProvider / translateModel).
* @param imageRefs - durable attachment refs of the images to analyze.
* @param userText - the user's accompanying text, or "".
* @param signal - abort signal for the call.
* @returns the rendered translation text (structured when parseable).
* @throws when the stream ends in an error/abort or yields no text.
*/
async function visionModelText(ctx, config, imageRefs, userText, signal) {
	const content = [
		...imageRefs.map((ref) => ({ type: "image", attachment: ref })),
		{ type: "text", text: VISION_TRANSLATE_PROMPT + (userText.trim() === "" ? "" : `\n\n用户的问题:\n${userText}`) }
	];
	const messages = [createUserMessage({ content })];
	const prepared = await ctx.llm.prepareCall({
		provider: config.translateModelProvider,
		model: config.translateModel,
		messages
	}, signal);
	const assembled = new BlockAssembler();
	for await (const chunk of prepared.stream({
		...prepared.config,
		messages,
		signal,
		__visionTranslation: true
	})) assembled.push(chunk);
	if (assembled.finish !== void 0 && assembled.finish.kind !== "stop") {
		if (assembled.finish.kind === "aborted") throw new Error("vision request aborted");
		throw new Error(`vision stream ended abnormally (${JSON.stringify(assembled.finish)})`);
	}
	const message = assembled.message();
	const text = (message?.content ?? []).filter((block) => block.type === "text").map((block) => block.text).join("");
	if (text.trim() === "") throw new Error("vision model returned no text");
	return renderStructuredTranslation(parseStructuredTranslation(text));
}
/**
* Request-layer image translation with a per-process cache.
*
* The session history keeps the user's original image blocks (the UI shows
* them), and the main model only ever sees translated text: at `llm/stream`
* time, image blocks in the request messages are replaced by their cached
* vision-model translation. The cache is keyed by the content-addressed
* attachment id, so the same image is translated once per process no matter
* how many turns or sessions reference it, and never re-translated on later
* turns (Open WebUI Vision Router's "mark as processed" behavior).
* @param ctx - host context (llm + attachments injected).
* @param config - plugin config (translateModelProvider / translateModel /
*   translateTimeoutMs).
* @param messages - the assembled request messages.
* @param cache - Map<attachmentId, translatedText>.
* @returns the translated messages (the same array when nothing changed).
*/
/**
* Translate one content array in place. Recurses into `tool-result` blocks
* (e.g. read_image results), since a text-only model must not receive those
* images either. Failed translations degrade to an explicit failure text and
* are NOT cached, so the next request retries them.
*/
async function translateContentWithCache(ctx, config, content, userText, cache) {
	let changed = false;
	const newContent = [];
	for (const block of content) {
		if (block?.type === "image" && block.attachment) {
			changed = true;
			const ref = block.attachment;
			const id = String(ref.attachmentId ?? ref.id ?? "");
			let text = id === "" ? void 0 : cache.get(id);
			if (text === void 0) {
				try {
					text = await visionModelText(ctx, config, [ref], userText, AbortSignal.timeout(config.translateTimeoutMs));
					if (id !== "") cache.set(id, text);
				} catch (error) {
					const code = error?.code ? ` [${error.code}]` : "";
					text = `[图片${ref.name ? ` "${ref.name}"` : ""}后台识别失败${code}: ${String(error?.message ?? error)}]`;
				}
			}
			newContent.push({ type: "text", text: `[图片后台识别结果]\n${text}` });
			continue;
		}
		if (block?.type === "tool-result" && contentHasImage(block.content)) {
			const nested = await translateContentWithCache(ctx, config, block.content, "", cache);
			if (nested.changed) {
				changed = true;
				newContent.push({ ...block, content: nested.content });
				continue;
			}
		}
		newContent.push(block);
	}
	return { content: newContent, changed };
}
export async function translateMessagesWithCache(ctx, config, messages, cache) {
	let changed = false;
	const out = [];
	for (const message of messages) {
		if (!contentHasImage(message?.content)) {
			out.push(message);
			continue;
		}
		const userText = (message.content ?? []).filter((block) => block?.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n");
		const { content, changed: messageChanged } = await translateContentWithCache(ctx, config, message.content, userText, cache);
		if (messageChanged) {
			changed = true;
			out.push({ ...message, content });
		} else {
			out.push(message);
		}
	}
	return changed ? out : messages;
}
/**
* Web image admission: let image-bearing prompts enter the session history
* NORMALLY (so the conversation UI shows the user's images), deferring the
* api-proxy capability answer only while they do. The actual translation
* happens later, at request time, in `installVisionReplacement` — the main
* model never sees the image blocks.
*
* A narrow `selectModel` wrapper still defers the capability answer for
* sessions whose history contains images (switching the session's model is
* allowed; the request layer keeps the text-only model safe by replacing
* the images). The wrappers restore the original methods after each call.
* @param ctx - the host context (llm + apiProxy injected).
* @returns a disposer restoring the original methods.
*/
export function installImageAdmission(ctx) {
	const sessions = ctx.apiProxy?.sessions;
	const llm = ctx.llm;
	if (!sessions || typeof sessions.prompt !== "function" || typeof sessions.selectModel !== "function" || !llm || typeof llm.resolveModelInfo !== "function") return () => {};
	const originalPrompt = sessions.prompt;
	const originalSelectModel = sessions.selectModel;
	const originalResolveModelInfo = llm.resolveModelInfo;
	/** The same capability answer, with image input admitted. */
	const imageAwareResolve = function (...args) {
		return Promise.resolve(originalResolveModelInfo.apply(this, args)).then((info) => {
			if (Array.isArray(info?.inputModalities) && !info.inputModalities.includes("image")) {
				return { ...info, inputModalities: [...info.inputModalities, "image"] };
			}
			return info;
		});
	};
	let chain = Promise.resolve();
	const serialize = (operation) => {
		const run = chain.then(operation);
		chain = run.then(() => void 0, () => void 0);
		return run;
	};
	sessions.prompt = (request) => serialize(async () => {
		const content = request?.payload?.content;
		const hasImage = Array.isArray(content) && content.some((part) => part?.type === "image") === true;
		if (!hasImage) return originalPrompt.call(sessions, request);
		llm.resolveModelInfo = imageAwareResolve;
		try {
			return await originalPrompt.call(sessions, request);
		} finally {
			llm.resolveModelInfo = originalResolveModelInfo;
		}
	});
	sessions.selectModel = (request) => serialize(async () => {
		// The switch check refuses a text-only target while the session still
		// contains images. Deferring the capability answer is safe here:
		// resolveCallConfig only picks up maxTokens/reasoningEffort/context
		// (never modalities), and the request-layer replacement still swaps
		// the historical image blocks for text on the text-only route.
		llm.resolveModelInfo = imageAwareResolve;
		try {
			return await originalSelectModel.call(sessions, request);
		} finally {
			llm.resolveModelInfo = originalResolveModelInfo;
		}
	});
	return () => {
		sessions.prompt = originalPrompt;
		sessions.selectModel = originalSelectModel;
	};
}
/**
* Install request-layer image translation by wrapping the llm service's
* stream entry points (`prepareCall`'s prepared stream, which the agent loop
* uses, plus the `llm.stream` fallback). The session history keeps the
* user's original image blocks (the conversation UI shows them); here, when
* a request's messages carry image blocks and the target model does not
* declare image input, the images are replaced by their cached vision-model
* translation before the adapter sees them. The first image-bearing request
* waits for the translation; later requests reuse the cache (Open WebUI
* Vision Router's "mark as processed" behavior). Vision-capable models pass
* through untouched (they see the originals).
*
* The wrappers return async generators: they await the translation first,
* then forward the original stream's chunks unchanged, so every downstream
* consumer (token metering, persistence, invariant checks) sees the same
* chunk protocol. The translation request itself is marked
* `__visionTranslation`, so it never recurses into these wrappers.
* @param ctx - the host context (llm injected).
* @param config - the plugin config (translate* fields).
* @returns a disposer restoring the original llm methods.
*/
export function installVisionReplacement(ctx, config) {
	const llm = ctx.llm;
	if (!llm || typeof llm.prepareCall !== "function" || typeof llm.resolveModelInfo !== "function") return () => {};
	const cache = new Map();
	const modelVisionCache = new Map();
	async function visionCapable(provider, model) {
		const key = `${provider}/${model}`;
		if (modelVisionCache.has(key)) return modelVisionCache.get(key);
		let capable = false;
		try {
			const info = await llm.resolveModelInfo(provider, model);
			capable = Array.isArray(info?.inputModalities) && info.inputModalities.includes("image");
		} catch {
			capable = false;
		}
		modelVisionCache.set(key, capable);
		return capable;
	}
	async function* translateAndForward(originalStream, options, self) {
		let effective = options;
		if (options?.__visionTranslation !== true) {
			const messages = options?.messages;
			if (Array.isArray(messages) && messages.some((message) => contentHasImage(message?.content))) {
				try {
					if (!(await visionCapable(options.provider, options.model))) {
						const replaced = await translateMessagesWithCache(ctx, config, messages, cache);
						if (replaced !== messages) effective = { ...options, messages: replaced };
					}
				} catch (error) {
					ctx.logger.warn(`vision replacement failed, passing request through: ${String(error?.message ?? error)}`);
				}
			}
		}
		yield* originalStream.call(self, effective);
	}
	const originalPrepareCall = llm.prepareCall;
	llm.prepareCall = async function (config, signal) {
		const prepared = await originalPrepareCall.call(this, config, signal);
		const originalStream = prepared.stream;
		return {
			...prepared,
			stream: (options) => translateAndForward(originalStream, options, this)
		};
	};
	const originalStreamMethod = llm.stream;
	if (typeof originalStreamMethod === "function") {
		llm.stream = function (options) {
			return translateAndForward(originalStreamMethod, options, this);
		};
	}
	return () => {
		llm.prepareCall = originalPrepareCall;
		if (originalStreamMethod !== void 0) llm.stream = originalStreamMethod;
	};
}
/** Render text blocks from the canonical JSON block array. */
function outputValueText(values) {
	return values.filter((value) => typeof value === "object" && value !== null && !Array.isArray(value) && value.type === "text" && typeof value.text === "string").map((value) => value.text).join("");
}
/** A non-`completed` stop reason means the child did not finish cleanly. */
function stopReasonError(result) {
	switch (result.stopReason) {
		case "completed": return;
		case "aborted": return "subagent run was cancelled";
		case "error": return "subagent run failed";
		case "max-tokens": return "subagent run hit its token limit before finishing";
		case "refusal": return "subagent declined the task";
		default: return `subagent run ended abnormally (${String(result.stopReason)})`;
	}
}
/** Append the child's preserved partial answer to a stop-reason error. */
function withPartialText(error, output) {
	const text = output.filter((block) => block.type === "text").map((block) => block.text).join("");
	return text.length === 0 ? error : `${error}\nPartial output before the run ended:\n${text}`;
}
/** Settle pending startup without rejecting the task producer contract. */
async function settleStart(start, signal) {
	try {
		return await settleRun(await start);
	} catch (error) {
		return signal.aborted ? { status: "killed" } : {
			status: "failed",
			detail: String(error)
		};
	}
}
/** Collect and release one foreground run without letting disposal replace an independent result failure. */
async function settleForegroundRun(run) {
	const [execution] = await Promise.allSettled([run.result.then((result) => {
		const error = stopReasonError(result);
		if (error !== void 0) throw new Error(withPartialText(error, result.output));
		return {
			kind: "foreground",
			runId: run.id,
			output: result.output
		};
	})]);
	const [disposal] = await Promise.allSettled([Promise.resolve().then(() => run.dispose())]);
	if (execution.status === "rejected") {
		if (disposal.status === "rejected") throw new AggregateError([execution.reason, disposal.reason], `subagent run failed: ${String(execution.reason)}; dispose failed: ${String(disposal.reason)}`);
		throw execution.reason;
	}
	if (disposal.status === "rejected") throw disposal.reason;
	return execution.value;
}
/** Resolve the model's optional scheduling request into one execution route. */
function resolveDelegationRun(request, backgroundEnabled) {
	if (!backgroundEnabled) {
		if (request.run_in_background === true) throw new Error("run_in_background is disabled for this tool instance (enableRunInBackground: false)");
		return { runInBackground: false };
	}
	return { runInBackground: request.run_in_background ?? false };
}
function apply(ctx, config) {
	// Vision pipeline: web image admission (images enter the history, the UI
	// shows them) + request-layer translation (the main model only ever sees
	// text). The legacy agent/request reroute is retired: request-layer
	// replacement covers legacy image-bearing sessions as well. With
	// translateImages off, neither wrapper is installed — the host's default
	// admission applies (text-only models refuse image prompts) and only the
	// subagent_vision tool remains.
	const translateEnabled = config.translateImages !== false;
	const disposeAdmission = translateEnabled ? installImageAdmission(ctx) : () => {};
	const disposeReplacement = translateEnabled ? installVisionReplacement(ctx, config) : () => {};
	const backgroundEnabled = config.enableRunInBackground !== false;
	let disposeTool;
	const mount = (provider) => {
		disposeTool = ctx.tools.register(defineTool({
			name: "subagent_vision",
			description: "Delegate visual understanding to a vision-capable subagent: it runs on a vision model (default opencode-go/qwen3.7-plus) and uses read_image to analyze images, screenshots, and UI mockups, returning structured findings as text. Use this when the current model route cannot accept image input, or when you want a focused visual analysis without polluting the main conversation. The subagent returns its result, not its intermediate steps. Give it a complete, standalone prompt: the image path(s) to read and the specific question to answer." + (backgroundEnabled ? " This call waits for the result by default. Set `run_in_background: true` to return a job id; collect with `job_output` and stop with `job_kill`." : ""),
			parameters: {
				description: {
					type: "string",
					required: true,
					description: "A short (3-5 word) description of the visual task, for display."
				},
				prompt: {
					type: "string",
					required: true,
					description: "The complete, self-contained task: exact image file path(s) (PNG/JPEG/WebP/GIF) to read with read_image, plus the specific question to answer about them."
				},
				...backgroundEnabled ? { run_in_background: {
					type: "boolean",
					description: "Whether to run as a background job and return its id. Defaults to false; collect with job_output or stop with job_kill."
				} } : {}
			},
			output: {
				schema: { oneOf: [
					{
						type: "object",
						additionalProperties: false,
						properties: {
							kind: {
								type: "string",
								required: true,
								const: "background"
							},
							jobId: {
								type: "string",
								required: true
							}
						}
					},
					{
						type: "object",
						additionalProperties: false,
						properties: {
							kind: {
								type: "string",
								required: true,
								const: "foreground"
							},
							runId: {
								type: "string",
								required: true
							},
							output: {
								type: "array",
								required: true,
								items: { type: "json" }
							}
						}
					}
				] },
				render: (_args, value) => [{
					type: "text",
					text: value.kind === "background" ? `started background vision subagent task ${value.jobId}` : outputValueText(value.output)
				}]
			},
			isConcurrencySafe: () => true,
			async execute(args, exec) {
				const parent = exec.agent;
				if (!parent) throw new Error("subagent_vision requires a calling agent (exec.agent was undefined)");
				const request = {
					label: args.description,
					prompt: [{
						type: "text",
						text: args.prompt
					}],
					parent,
					persona: VISION_PERSONA,
					agentOptions: {
						provider: config.modelProvider,
						model: config.model
					}
				};
				if (resolveDelegationRun(args, backgroundEnabled).runInBackground) {
					const jobs = ctx.get("jobs");
					if (jobs === void 0) throw new Error("background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs");
					return {
						kind: "background",
						jobId: jobs.start({
							kind: "subagent",
							label: args.description,
							owner: parent,
							outputLimitBytes: 1024 * 1024,
							run: () => {
								const controller = new AbortController();
								let lastOutput = "";
								return {
									cancel: (reason) => {
										controller.abort(reason ?? "background vision subagent task killed");
									},
									readOutput: () => lastOutput,
									done: (async () => {
										const settled = await settleStart(ctx.subagents.start(config.provider, {
											...request,
											signal: controller.signal
										}), controller.signal);
										lastOutput = settled.output !== void 0 && Array.isArray(settled.output) ? outputValueText(settled.output) : settled.status === "completed" ? "" : `[${settled.status}] ${settled.detail ?? ""}`;
										return settled;
									})()
								};
							}
						})
					};
				}
				return settleForegroundRun(await ctx.subagents.start(config.provider, {
					...request,
					signal: exec.signal
				}));
			}
		}));
	};
	const disposeProviderAdded = ctx.on("subagent/provider-added", (provider) => {
		if (provider.name === config.provider && disposeTool === void 0) mount(provider);
	});
	const disposeProviderRemoved = ctx.on("subagent/provider-removed", (name) => {
		if (name !== config.provider || disposeTool === void 0) return;
		disposeTool();
		disposeTool = void 0;
	});
	const present = ctx.subagents.getProvider(config.provider);
	if (present !== void 0) mount(present);
	else ctx.logger.info(`subagent provider "${config.provider}" not registered yet; the "subagent_vision" tool will register when it appears`);
	ctx.effect(() => () => {
		disposeAdmission();
		disposeReplacement();
		disposeProviderAdded();
		disposeProviderRemoved();
		disposeTool?.();
	}, "tool-subagent-vision");
}
//#endregion
export { Config, apply, inject, name };
