// dsh-ui-session-tree — browser half (client plugin bundle).
//
// Loaded by dsh-client-modules at /plugins/dsh-ui-session-tree/client.js and
// executed through the vendored cordis Loader's lazy-CJS module table
// (window.__ModuleLoader__.load), the same shape as dsh-skin-desktop's bundle.
//
// What this plugin does
// ---------------------
// DSH persists every conversation as an append-only event log; a fork copies
// the parent's prefix into a child session (`parentSession` +
// `session/end-seed` marker in the header/log). The stock UI flattens that
// lineage into an indented session list. This plugin rebuilds the lineage as
// a git-graph style vertical tree in a right-side panel:
//
//   - session.list summaries (parentSessionId) give the forest topology;
//   - session.history events give each branch's turns and, via the trailing
//     `session/end-seed`, the exact fork anchor on the parent trunk;
//   - clicking a turn forks at that turn (`session.fork({sessionId, atSeq})`);
//     rewind/undo (⟲) cuts BEFORE the turn, inherits the title and archives
//     the abandoned path (Claude Code / pi in-place undo; DSH's log is
//     append-only, so undo is still a self-fork underneath).
//   - dragging a node onto another lane hands the source's delta turns to
//     that branch (`session.prompt` queue). Click-to-pin remains the fallback
//     for range selection and keyboard.
//
// Everything runs client-side; the host half is a no-op.
window.__ModuleLoader__.load({
	id: "dsh-ui-session-tree",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let jsxRuntime = require("react/jsx-runtime");
		let React = require("react");

		/** Small jsx helper so the factory body stays hand-readable. */
		function el(type, props) {
			var kids = [];
			for (var i = 2; i < arguments.length; i++) kids.push(arguments[i]);
			var p = props === null || props === undefined ? {} : Object.assign({}, props);
			if (kids.length > 0) p.children = kids.length === 1 ? kids[0] : kids;
			return jsxRuntime.jsx(type, p, p.key);
		}
		var Fragment = jsxRuntime.Fragment;

		//#region constants ----------------------------------------------------
		var STORAGE_KEY = "dsh-session-tree:open";
		var STYLE_ID = "dsh-session-tree-styles";
		var STYLE_VER = "12";
		var ROW_H = 34;
		var LANE_X0 = 20;
		var LANE_GAP = 24;
		var DOT_R = 5;
		var LABEL_MAX = 64;
		/** Squared pointer delta (px) before a node press becomes a handoff drag. */
		var DRAG_THRESHOLD_SQ = 64;
		/** Branch-lane identity hues (the trunk lane stays graphite): carried by
		 * each lane's vertical, curves, dots, hover band and tooltip rail.
		 * Mid-tone values chosen to read on both light and dark surfaces. */
		var LANE_HUES = ["#5b8def", "#3fb6a8", "#9d7bea", "#dfa23f", "#e07b9d", "#7bc063", "#58b7d6", "#c98bdb"];
		/** Lane hue by DISTANCE from the trunk lane: lanes right of the trunk
		 * take the palette from the start, mirrored left-side lanes from the
		 * end — columns adjacent across the trunk never share a hue. */
		function laneColor(lane, trunkLane) {
			if (trunkLane === undefined) trunkLane = 0;
			var d = lane - trunkLane;
			if (d === 0) return "var(--dsw-alias-label-secondary,#a8a8b0)";
			var index = d > 0 ? (d - 1) % LANE_HUES.length : LANE_HUES.length - 1 - ((-d - 1) % LANE_HUES.length);
			return LANE_HUES[index];
		}
		/** Identity-stable empty fallback: a fresh [] literal in render would
		 * churn the forest memo and restart lazy loads on every render. */
		var EMPTY_ARCHIVED = [];
		//#endregion

		//#region styles -------------------------------------------------------
		// Visual system: "surveyor's graph". Every branch lane carries a stable
		// hue (LANE_HUES below) through its vertical, curves, dots, hover band
		// and tooltip rail; the trunk stays graphite (git convention). All
		// surfaces stay on host theme tokens so light/dark both work.
		var CSS = [
			"@keyframes dsh-st-in{from{transform:translateX(14px);opacity:0}to{transform:none;opacity:1}}",
			".dsh-st-panel{position:fixed;top:0;right:0;bottom:0;width:min(380px,92vw);display:flex;flex-direction:column;",
			"background:var(--dsw-alias-bg-layer-1,#1b1b1f);border-left:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.25));",
			"box-shadow:-16px 0 40px rgba(0,0,0,.24);z-index:60;pointer-events:auto;font-size:13px;",
			"color:var(--dsw-alias-label-primary,#e8e8ea);animation:dsh-st-in .18s var(--ds-ease-in-out,ease-out)}",
			".dsh-st-head{display:flex;align-items:center;gap:8px;padding:13px 14px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.25));flex:0 0 auto}",
			".dsh-st-title{font-weight:600;letter-spacing:.01em}",
			".dsh-st-sub{color:var(--dsw-alias-label-tertiary,#8b8b93);font-size:11px;margin-left:auto;white-space:nowrap;font-variant-numeric:tabular-nums}",
			".dsh-st-iconbtn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;border-radius:7px;cursor:pointer;",
			"background:transparent;color:var(--dsw-alias-label-secondary,#a8a8b0);font-size:14px;line-height:1;transition:background .12s,color .12s}",
			".dsh-st-iconbtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.15));color:var(--dsw-alias-label-primary,#e8e8ea)}",
			".dsh-st-body{flex:1 1 auto;overflow-y:auto;overflow-x:auto;padding:10px 8px 24px}",
			".dsh-st-empty{padding:44px 16px;color:var(--dsw-alias-label-tertiary,#8b8b93);text-align:center;font-size:12.5px;line-height:1.7}",
			".dsh-st-empty svg{display:block;margin:0 auto 10px;opacity:.55}",
			".dsh-st-error{margin:0 8px 8px;padding:8px 10px;border-radius:10px;font-size:12px;white-space:pre-wrap;",
			"background:rgba(220,80,80,.12);border:1px solid rgba(220,80,80,.4);color:#f0a0a0;word-break:break-all}",
			".dsh-st-root{margin:0 0 10px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.25));border-radius:12px;overflow:hidden;",
			"background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.06))}",
			".dsh-st-rootbar{display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;user-select:none}",
			".dsh-st-rootbar:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}",
			".dsh-st-caret{width:14px;text-align:center;color:var(--dsw-alias-label-tertiary,#8b8b93);transition:transform .15s}",
			".dsh-st-root.expanded .dsh-st-caret{transform:rotate(90deg)}",
			".dsh-st-rootname{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;font-weight:500}",
			".dsh-st-rootmeta{color:var(--dsw-alias-label-tertiary,#8b8b93);font-size:11px;white-space:nowrap;font-variant-numeric:tabular-nums}",
			".dsh-st-badge{flex:0 0 auto;font-size:10px;font-weight:500;padding:2px 7px;border-radius:99px;",
			"background:var(--dsw-alias-brand-primary,#4d86f8);color:var(--dsw-alias-brand-text,#fff)}",
			// Safe centering: block + auto margins centers when it fits and
			// left-aligns (scrollable) when the lane block is wider — flex
			// centering would clip BOTH sides under overflow.
			".dsh-st-canvas-wrap{padding:6px 0 4px}",
			// Row ruling: one hairline per ROW_H rows — the surveyor's grid
			// that carries the eye from a node across to the row's action zone.
			".dsh-st-canvas{position:relative;margin:0 auto;",
			"background-image:repeating-linear-gradient(180deg,color-mix(in srgb,var(--dsw-alias-label-primary,#e8e8ea) 4%,transparent) 0 1px,transparent 1px 34px)}",
			".dsh-st-svg{position:absolute;left:0;top:0;pointer-events:none}",
			".dsh-st-row{position:absolute;left:0;right:0;height:" + ROW_H + "px;display:flex;align-items:center;cursor:pointer}",
			".dsh-st-row::after{content:\"\";position:absolute;inset:3px 6px;border-radius:8px;z-index:0;pointer-events:none;",
			"background:color-mix(in srgb,var(--dsh-st-lane,var(--dsw-alias-label-secondary,#a8a8b0)) 8%,transparent);opacity:0;transition:opacity .12s}",
			".dsh-st-row:hover::after,.dsh-st-row:focus-within::after{opacity:1}",
			".dsh-st-dot,.dsh-st-headmark,.dsh-st-actions{z-index:1}",
			".dsh-st-dot{position:absolute;width:" + 2*DOT_R + "px;height:" + 2*DOT_R + "px;border-radius:50%;transform:translate(-50%,-50%);left:0;top:" + (ROW_H/2) + "px;",
			"background:var(--dsh-st-lane,var(--dsw-alias-label-secondary,#a8a8b0));box-shadow:0 0 0 2.5px var(--dsw-alias-bg-layer-1,#1b1b1f);",
			"transition:transform .12s var(--ds-ease-in-out,ease-out)}",
			".dsh-st-row:hover .dsh-st-dot{transform:translate(-50%,-50%) scale(1.3)}",
			// Current session's turns: the lane dot plus a soft halo.
			".dsh-st-row.current .dsh-st-dot{box-shadow:0 0 0 2.5px var(--dsw-alias-bg-layer-1,#1b1b1f),0 0 0 6px color-mix(in srgb,var(--dsh-st-lane,#4d86f8) 24%,transparent)}",
			".dsh-st-dot.open{background:transparent;border:" + Math.max(1.5,DOT_R-3) + "px solid var(--dsh-st-lane,var(--dsw-alias-label-secondary,#a8a8b0))}",
			".dsh-st-headmark{position:absolute;width:15px;height:15px;border-radius:50%;transform:translate(-50%,-50%);left:0;top:" + (ROW_H/2) + "px;",
			"border:2.5px solid var(--dsh-st-lane,var(--dsw-alias-label-secondary,#a8a8b0));background:var(--dsw-alias-bg-layer-1,#1b1b1f);",
			"box-shadow:0 0 0 2.5px var(--dsw-alias-bg-layer-1,#1b1b1f);transition:transform .12s var(--ds-ease-in-out,ease-out)}",
			".dsh-st-row:hover .dsh-st-headmark{transform:translate(-50%,-50%) scale(1.12)}",
			".dsh-st-row.current .dsh-st-headmark{background:var(--dsh-st-lane,#4d86f8)}",
			".dsh-st-row.running .dsh-st-headmark,.dsh-st-row.running .dsh-st-dot.open{animation:dsh-st-pulse 1.2s ease-in-out infinite}",
			"@keyframes dsh-st-pulse{0%,100%{box-shadow:0 0 0 2.5px var(--dsw-alias-bg-layer-1,#1b1b1f),0 0 0 4px color-mix(in srgb,var(--dsh-st-lane,#4d86f8) 0%,transparent)}50%{box-shadow:0 0 0 2.5px var(--dsw-alias-bg-layer-1,#1b1b1f),0 0 0 7px color-mix(in srgb,var(--dsh-st-lane,#4d86f8) 32%,transparent)}}",
			".dsh-st-tip{position:fixed;z-index:80;max-width:min(340px,calc(100vw - 24px));pointer-events:auto;",
			"background:var(--dsw-alias-bg-overlay,#26262b);border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));",
			"box-shadow:inset 3px 0 0 var(--dsh-st-lane,#4d86f8),0 8px 28px rgba(0,0,0,.35);border-radius:10px;padding:10px 12px;",
			"color:var(--dsw-alias-label-primary,#e8e8ea)}",
			".dsh-st-tip-meta{font-size:11px;color:var(--dsw-alias-label-tertiary,#8b8b93);margin-bottom:6px;font-variant-numeric:tabular-nums}",
			".dsh-st-tip-body{font-size:12.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;max-height:240px;overflow-y:auto;color:var(--dsw-alias-label-secondary,#c9c9cf)}",
			".dsh-st-tip-actions{display:flex;gap:8px;margin-top:10px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2));pointer-events:auto}",
			".dsh-st-tipbtn{display:inline-flex;align-items:center;gap:5px;flex:0 0 auto;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));border-radius:7px;cursor:pointer;",
			"background:var(--dsw-alias-bg-layer-2,#1b1b1f);color:var(--dsw-alias-label-secondary,#c9c9cf);font-size:12px;padding:5px 10px;line-height:1;",
			"transition:border-color .12s,color .12s}",
			".dsh-st-tipbtn svg{flex:none}",
			".dsh-st-tipbtn:hover:not(:disabled){color:var(--dsw-alias-label-primary,#e8e8ea);border-color:var(--dsw-alias-brand-primary,#4d86f8)}",
			".dsh-st-tipbtn.rewind:hover:not(:disabled){border-color:#e8b45a;color:#e8b45a}",
			".dsh-st-tipbtn.danger:hover:not(:disabled){border-color:#e07070;color:#f09090}",
			".dsh-st-tipbtn:disabled{opacity:.4;cursor:not-allowed}",
			".dsh-st-actions{position:absolute;right:6px;top:0;height:100%;display:flex;align-items:center;gap:2px;opacity:0;transition:opacity .12s;",
			"background:linear-gradient(90deg,transparent,var(--dsw-alias-bg-layer-1,#1b1b1f) 18px)}",
			".dsh-st-row:hover .dsh-st-actions,.dsh-st-row:focus-within .dsh-st-actions{opacity:1}",
			".dsh-st-act{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:none;border-radius:6px;cursor:pointer;background:transparent;",
			"color:var(--dsw-alias-label-secondary,#a8a8b0);font-size:13px;line-height:1;padding:0}",
			".dsh-st-act:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.2));color:var(--dsw-alias-label-primary,#e8e8ea)}",
			".dsh-st-act.rewind:hover{color:#e8b45a}",
			".dsh-st-act.danger:hover{color:#f09090}",
			".dsh-st-act:disabled{opacity:.35;cursor:not-allowed}",
			".dsh-st-confirm{display:flex;align-items:center;gap:8px;margin:0 8px 8px;padding:8px 10px;border-radius:10px;flex-wrap:wrap;",
			"background:rgba(220,80,80,.1);border:1px solid rgba(220,80,80,.4)}",
			".dsh-st-confirm.handoff{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d86f8) 9%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d86f8) 38%,transparent)}",
			// Handoff confirm bar: source title owns the first row, the target
			// picker + live delta count + buttons share the second.
			".dsh-st-confirm-title{flex:1 1 100%;min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary,#c9c9cf)}",
			".dsh-st-confirm-select{flex:1 1 150px;min-width:120px;max-width:100%;height:28px;padding:0 6px;border-radius:7px;font-size:12px;",
			"background:var(--dsw-alias-bg-layer-2,#1b1b1f);color:var(--dsw-alias-label-secondary,#c9c9cf);",
			"border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));cursor:pointer}",
			".dsh-st-confirm-select:focus{outline:none;border-color:var(--dsw-alias-brand-primary,#4d86f8)}",
			".dsh-st-confirm-meta{flex:0 0 auto;font-size:11px;color:var(--dsw-alias-label-tertiary,#8b8b93);white-space:nowrap;font-variant-numeric:tabular-nums}",
			".dsh-st-pinbar{display:flex;align-items:center;gap:8px;margin:0 8px 8px;padding:8px 10px;border-radius:10px;flex-wrap:wrap;",
			"background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d86f8) 7%,transparent);border:1px dashed color-mix(in srgb,var(--dsw-alias-brand-primary,#4d86f8) 45%,transparent)}",
			".dsh-st-pinbar-text{flex:1 1 140px;min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary,#c9c9cf);overflow:hidden;text-overflow:ellipsis}",
			".dsh-st-dot,.dsh-st-headmark{cursor:grab;touch-action:none}",
			".dsh-st-dot::before,.dsh-st-headmark::before{content:\"\";position:absolute;inset:-6px;border-radius:50%}",
			".dsh-st-row.pinned .dsh-st-dot,.dsh-st-row.pinned .dsh-st-headmark{transform:translate(-50%,-50%) scale(1.3);",
			"box-shadow:0 0 0 2.5px var(--dsw-alias-bg-layer-1,#1b1b1f),0 0 0 6.5px color-mix(in srgb,var(--dsw-alias-brand-primary,#4d86f8) 60%,transparent)}",
			".dsh-st-row.in-range .dsh-st-dot{transform:translate(-50%,-50%) scale(1.12);",
			"box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-1,#1b1b1f),0 0 0 5px color-mix(in srgb,var(--dsw-alias-brand-primary,#4d86f8) 32%,transparent)}",
			".dsh-st-panel.dragging{touch-action:none}",
			".dsh-st-panel.dragging,.dsh-st-panel.dragging *{cursor:grabbing!important;-webkit-user-select:none;user-select:none}",
			".dsh-st-panel.dragging .dsh-st-row{opacity:.4}",
			".dsh-st-panel.dragging .dsh-st-row.drag-source,.dsh-st-panel.dragging .dsh-st-row.drop-target{opacity:1}",
			".dsh-st-row.drop-target::after{opacity:1;background:color-mix(in srgb,var(--dsh-st-lane,var(--dsw-alias-brand-primary,#4d86f8)) 18%,transparent)}",
			".dsh-st-row.drop-target .dsh-st-dot,.dsh-st-row.drop-target .dsh-st-headmark{transform:translate(-50%,-50%) scale(1.22);",
			"box-shadow:0 0 0 2.5px var(--dsw-alias-bg-layer-1,#1b1b1f),0 0 0 6px color-mix(in srgb,var(--dsh-st-lane,#4d86f8) 40%,transparent)}",
			".dsh-st-draglayer{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:90}",
			".dsh-st-dragchip{position:fixed;z-index:91;pointer-events:none;max-width:min(240px,70vw);padding:5px 10px;border-radius:8px;",
			"background:var(--dsw-alias-bg-overlay,#26262b);border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));",
			"box-shadow:inset 3px 0 0 var(--dsh-st-lane,#4d86f8),0 6px 18px rgba(0,0,0,.28);",
			"color:var(--dsw-alias-label-primary,#e8e8ea);font-size:12px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".dsh-st-confirm-text{flex:1 1 120px;min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary,#c9c9cf);overflow:hidden;text-overflow:ellipsis}",
			".dsh-st-loading{padding:6px 16px;color:var(--dsw-alias-label-tertiary,#8b8b93);font-size:12px}",
			// The footer entry takes a whole line of the host's footer-actions
			// flex row (which this plugin wraps via an inline style on mount);
			// rail mode (wide=false) keeps it content-sized and centered.
			".dsh-st-footrow{flex:0 0 100%;width:100%;min-width:0;display:flex;align-items:center;justify-content:center}",
			".dsh-st-footbtn{display:inline-flex;align-items:center;justify-content:center;gap:7px;flex:0 0 auto;",
			"min-height:34px;padding:0 12px;border:none;border-radius:8px;cursor:pointer;",
			"background:transparent;color:var(--dsw-alias-label-secondary,#a8a8b0);font-size:12.5px;text-align:left;white-space:nowrap;transition:background .12s,color .12s}",
			".dsh-st-footbtn.wide{width:100%;justify-content:flex-start}",
			".dsh-st-footbtn svg{display:block}",
			".dsh-st-footbtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,#e8e8ea)}",
			".dsh-st-footbtn.on{color:var(--dsw-alias-brand-primary,#4d86f8);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d86f8) 10%,transparent)}",
			"@media (prefers-reduced-motion:reduce){.dsh-st-panel{animation:none}.dsh-st-dot,.dsh-st-headmark,.dsh-st-row::after,.dsh-st-iconbtn,.dsh-st-footbtn,.dsh-st-tipbtn{transition:none}.dsh-st-row.running .dsh-st-headmark,.dsh-st-row.running .dsh-st-dot.open{animation:none}.dsh-st-dragchip{animation:none}}"
		].join("");

		function ensureStyles() {
			if (typeof document === "undefined") return;
			var existing = document.getElementById(STYLE_ID);
			if (existing !== null && existing.getAttribute("data-ver") === STYLE_VER) return;
			if (existing !== null) existing.remove();
			var tag = document.createElement("style");
			tag.id = STYLE_ID;
			tag.setAttribute("data-ver", STYLE_VER);
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}
		//#endregion

		//#region panel open-state store ---------------------------------------
		var openListeners = new Set();
		var panelOpen = false;
		try {
			panelOpen = window.localStorage.getItem(STORAGE_KEY) === "1";
		} catch (_) { /* private mode etc. */ }
		function subscribeOpen(fn) {
			openListeners.add(fn);
			return function () { openListeners.delete(fn); };
		}
		function snapshotOpen() { return panelOpen; }
		function setPanelOpen(value) {
			if (value === panelOpen) return;
			panelOpen = value;
			try {
				window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
			} catch (_) { /* ignore */ }
			openListeners.forEach(function (fn) { fn(); });
		}
		//#endregion

		//#region data layer ----------------------------------------------------
		/** First text block of a message content array. */
		function firstText(content) {
			if (Array.isArray(content) !== true) return "";
			for (var i = 0; i < content.length; i++) {
				var part = content[i];
				if (part !== null && typeof part === "object" && part.type === "text" && typeof part.text === "string") {
					return part.text;
				}
			}
			return "";
		}

		/** All text blocks of a content array joined with blank lines (assistant
		 * messages carry reasoning + text blocks; only text is kept). */
		function allText(content) {
			if (Array.isArray(content) !== true) return "";
			var parts = [];
			for (var i = 0; i < content.length; i++) {
				var part = content[i];
				if (part !== null && typeof part === "object" && part.type === "text" && typeof part.text === "string") parts.push(part.text);
			}
			return parts.join("\n\n");
		}

		/**
		 * Pull a session's complete event log, following history pages backwards
		 * until exhausted. Pages align to whole messages; the anchor for the
		 * next page is the earliest seq of the page just received.
		 */
		async function fetchAllEvents(api, sessionId, signal) {
			var all = [];
			var beforeSeq;
			var pages = 0;
			for (;;) {
				var payload = { sessionId: sessionId };
				if (beforeSeq !== undefined) payload.beforeSeq = beforeSeq;
				var response = await api.sessions.history(payload, signal);
				var result = response.result;
				if (result.ok !== true) throw new Error(result.error.message);
				var events = result.value.events.map(function (e) { return e.event; });
				all = events.concat(all);
				if (result.value.hasMore !== true || events.length === 0) break;
				// Defensive: a page that does not strictly move the cursor
				// backwards means the server ignored beforeSeq — bail instead of
				// looping forever on the same page.
				if (beforeSeq !== undefined && !(events[0].seq < beforeSeq)) break;
				beforeSeq = events[0].seq;
				pages++;
				if (pages > 200) throw new Error("history 分页异常：已拉取 200 页仍未结束，中止");
			}
			return all;
		}

		/** Per-turn assistant text cap (handoff payload source material). */
		var ASSISTANT_MAX = 4000;
		/**
		 * Fold a raw event log into the facts the tree needs: turns (with first
		 * user text, condensed assistant text and tool usage — the raw material
		 * for branch handoff) and the first user text for the label fallback.
		 * Own-vs-seeded is NOT decided here — see layoutRoot.emitBranch (seed
		 * markers cannot tell fork boundaries from compaction boundaries).
		 */
		function foldSession(events) {
			var turns = [];
			var cur = null;
			var finish = function (t) {
				t.assistantText = t.assistantParts.join("\n\n").slice(0, ASSISTANT_MAX);
				delete t.assistantParts;
				return t;
			};
			for (var i = 0; i < events.length; i++) {
				var e = events[i];
				if (e.type === "turn/start") {
					// Torn logs can miss a turn/end: keep the orphaned open turn
					// instead of silently dropping it when the next one starts.
					if (cur !== null) turns.push(finish(cur));
					cur = {
						turn: (e.data !== null && typeof e.data === "object" && typeof e.data.turn === "number") ? e.data.turn : turns.length + 1,
						startSeq: e.seq,
						endSeq: null,
						time: e.time,
						userText: "",
						assistantParts: [],
						tools: {}
					};
				} else if (e.type === "user/message" && cur !== null && cur.userText === "") {
					cur.userText = firstText(e.data !== null && typeof e.data === "object" ? e.data.content : undefined).trim();
				} else if (e.type === "assistant/message" && cur !== null) {
					var ad = e.data !== null && typeof e.data === "object" ? e.data : {};
					var am = ad.message !== null && typeof ad.message === "object" ? ad.message : {};
					var at = allText(am.content);
					if (at !== "") cur.assistantParts.push(at);
				} else if (e.type === "tool/call" && cur !== null) {
					var tn = e.data !== null && typeof e.data === "object" && typeof e.data.name === "string" ? e.data.name : "?";
					cur.tools[tn] = (cur.tools[tn] || 0) + 1;
				} else if (e.type === "turn/end" && cur !== null) {
					cur.endSeq = e.seq;
					turns.push(finish(cur));
					cur = null;
				}
			}
			if (cur !== null) turns.push(finish(cur)); // still-open (running) turn
			var firstName = "";
			for (var f = 0; f < turns.length; f++) {
				if (turns[f].userText !== "") { firstName = turns[f].userText; break; }
			}
			return { turns: turns, firstUserText: firstName };
		}

		/**
		 * Node-diff turns of one branch relative to another: the source's
		 * completed turns whose end seq does NOT exist in the target's turn
		 * list. Forks copy events keeping their seqs, so shared ancestry falls
		 * out exactly; works for parent→child, child→parent and sibling↔sibling
		 * alike. `fromEndSeq`/`uptoEndSeq` bound the inclusive handoff range
		 * (null = unbounded on that side). Two dots on the SAME branch pick
		 * this window; the target-seq subtract still drops shared ancestry.
		 */
		function deltaTurnsOf(sourceFold, targetFold, uptoEndSeq, fromEndSeq) {
			if (fromEndSeq === undefined) fromEndSeq = null;
			var targetEnds = new Set();
			for (var i = 0; i < targetFold.turns.length; i++) {
				if (targetFold.turns[i].endSeq !== null) targetEnds.add(targetFold.turns[i].endSeq);
			}
			var delta = [];
			for (var j = 0; j < sourceFold.turns.length; j++) {
				var t = sourceFold.turns[j];
				if (t.endSeq === null) continue; // open turns are not handoff material
				if (fromEndSeq !== null && t.endSeq < fromEndSeq) continue;
				if (uptoEndSeq !== null && t.endSeq > uptoEndSeq) continue;
				if (targetEnds.has(t.endSeq)) continue;
				delta.push(t);
			}
			return delta;
		}

		/** Single-node pin: head = whole branch, turn = from start through this turn. */
		function pinFromRow(row) {
			var cut = row.kind === "head" ? null : row.turn.endSeq;
			return {
				sessionId: row.sessionId,
				fromEndSeq: null,
				uptoEndSeq: cut,
				fromLabel: null,
				turnLabel: row.kind === "head" ? null : "第 " + row.turn.turn + " 轮"
			};
		}

		/** Inclusive range between two cuts. null cut = branch head.
		 *  Head then a turn narrows the whole-branch pin to "through that turn";
		 *  a turn then the head extends that turn through the latest. */
		function makePinRange(sessionId, aCut, aLabel, bCut, bLabel) {
			if (aCut === bCut) {
				return { sessionId: sessionId, fromEndSeq: null, uptoEndSeq: aCut, fromLabel: null, turnLabel: aLabel };
			}
			if (aCut === null) {
				return { sessionId: sessionId, fromEndSeq: null, uptoEndSeq: bCut, fromLabel: null, turnLabel: bLabel };
			}
			if (bCut === null) {
				return { sessionId: sessionId, fromEndSeq: aCut, uptoEndSeq: null, fromLabel: aLabel, turnLabel: "最新" };
			}
			if (aCut < bCut) {
				return { sessionId: sessionId, fromEndSeq: aCut, uptoEndSeq: bCut, fromLabel: aLabel, turnLabel: bLabel };
			}
			return { sessionId: sessionId, fromEndSeq: bCut, uptoEndSeq: aCut, fromLabel: bLabel, turnLabel: aLabel };
		}

		function pinRangeCaption(pin) {
			if (pin === null) return "";
			if (pin.fromEndSeq !== null && pin.uptoEndSeq !== null) return pin.fromLabel + "–" + pin.turnLabel;
			if (pin.fromEndSeq !== null && pin.uptoEndSeq === null) return pin.fromLabel + "–最新";
			if (pin.uptoEndSeq !== null) return "截至" + pin.turnLabel;
			return "整支成果";
		}

		/** Handoff message: the selected-range transcript wrapped in a digest
		 * instruction for the TARGET session's current model to absorb. */
		function buildHandoffText(label, deltaTurns, rangeCaption) {
			var USER_MAX = 1200, ASST_MAX = 2400, TOTAL_MAX = 30000;
			var entries = [];
			var total = 0;
			for (var i = 0; i < deltaTurns.length; i++) {
				var t = deltaTurns[i];
				var toolNames = Object.keys(t.tools);
				var toolLine = toolNames.length > 0 ? "(工具: " + toolNames.map(function (n) { return n + "×" + t.tools[n]; }).join(", ") + ")" : "";
				var u = t.userText.length > USER_MAX ? t.userText.slice(0, USER_MAX) + "…" : t.userText;
				var a = t.assistantText.length > ASST_MAX ? t.assistantText.slice(0, ASST_MAX) + "…" : t.assistantText;
				var entry = "【第 " + t.turn + " 轮】" + toolLine +
					"\n用户:" + (u !== "" ? u : "(无文本输入)") +
					"\n助手:" + (a !== "" ? a : "(无文本回复)");
				entries.push(entry);
				total += entry.length;
			}
			var omitted = 0;
			// Over budget: drop the OLDEST turns first — the latest turns carry
			// the branch's outcome.
			while (total > TOTAL_MAX && entries.length > 1) {
				total -= entries[0].length;
				entries.shift();
				omitted++;
			}
			var rangeBit = rangeCaption ? "（" + rangeCaption + "）" : "";
			var head = "【分支结果移交】来源分支:「" + label + "」" + rangeBit +
				" 交来 " + deltaTurns.length + " 轮内容（已去掉当前会话已有的轮次）。请消化吸收其中的结论与已完成的工作,结合当前会话的上下文继续推进当前任务,不要重复执行其中已完成的操作。\n\n──── 移交内容开始 ────\n\n";
			var tail = "\n\n──── 移交内容结束 ────" + (omitted > 0 ? "\n(最早的 " + omitted + " 轮因篇幅限制已省略)" : "");
			return head + entries.join("\n\n") + tail;
		}

		/** Coerce any snapshot skew into a renderable placeholder summary. */
		function summaryOrPlaceholder(summary, sessionId) {
			if (summary !== null && typeof summary === "object" && summary.id !== undefined) return summary;
			return { id: sessionId, displayTitle: "", updatedAt: 0, running: false, blank: false };
		}

		/** Display label for a session: durable title, else display title, else first user text. */
		function sessionLabel(summary, fold) {
			summary = summaryOrPlaceholder(summary, "unknown");
			if (typeof summary.title === "string" && summary.title !== "") return summary.title;
			if (typeof summary.displayTitle === "string" && summary.displayTitle !== "") return summary.displayTitle;
			var text = fold !== undefined && fold.firstUserText !== "" ? fold.firstUserText : "";
			if (text !== "") return text.length > LABEL_MAX ? text.slice(0, LABEL_MAX - 1) + "…" : text;
			var id = String(summary.id);
			return "session " + id.slice(0, 8);
		}

		/** Clamp a session label for inline button captions. */
		function clampLabel(v, n) {
			v = String(v === undefined || v === null ? "" : v);
			return v.length > n ? v.slice(0, n - 1) + "…" : v;
		}

		/**
		 * Nearest tree-present (living) STRICT ancestor of `startId`, walking the
		 * RAW list rows — archived rows keep their parent links in session.list,
		 * so the chain survives hidden middles. `forbidden` breaks chains that
		 * loop back into the descendant itself; undefined when nothing living
		 * remains above — the caller falls back to promoting a root.
		 */
		function nearestLivingAncestor(startId, forbidden, byId, present) {
			var seen = new Set([startId]);
			var cursor = byId[startId];
			while (cursor !== undefined && cursor !== null) {
				var pid = cursor.parentId;
				if (pid === undefined || pid === forbidden || seen.has(pid)) return undefined;
				seen.add(pid);
				if (present.has(pid)) return pid;
				cursor = byId[pid];
			}
			return undefined;
		}

		/**
		 * Session-list snapshot → forest topology. Blank and subagent sessions
		 * are dropped; archived sessions are dropped the same way every stock
		 * grouping surface does. A child whose parent was archived (rewind
		 * auto-archives its source; 🗑 can hit a middle branch) is GRAFTED to
		 * its nearest living ancestor via nearestLivingAncestor instead of
		 * being ripped out as a lone root — the seq-matching layout then
		 * re-anchors it exactly where the hidden branch forked. Only true
		 * orphans (no living ancestor) degrade to roots (same policy as
		 * flattenLineage).
		 */
		function buildForest(list, archivedIds) {
			var archived = Array.isArray(archivedIds) ? new Set(archivedIds) : new Set();
			var byId = list.byId !== null && typeof list.byId === "object" ? list.byId : {};
			var rows = [];
			var seen = new Set();
			var ids = list.ids !== null && typeof list.ids === "object" ? list.ids : [];
			for (var i = 0; i < ids.length; i++) {
				var row = byId[ids[i]];
				if (row === undefined || row === null) continue;
				if (row.blank === true) continue;
				if (row.origin === "subagent") continue;
				if (archived.has(row.id)) continue;
				if (seen.has(row.id)) continue;
				seen.add(row.id);
				rows.push(row);
			}
			var present = new Set(rows.map(function (r) { return r.id; }));
			var childrenOf = new Map();
			var roots = [];
			for (var j = 0; j < rows.length; j++) {
				var r = rows[j];
				var parent = r.parentId;
				if (parent !== undefined && present.has(parent)) {
					var list2 = childrenOf.get(parent);
					if (list2 === undefined) { list2 = []; childrenOf.set(parent, list2); }
					list2.push(r);
				} else if (parent !== undefined) {
					// Parent hidden (archived/filtered): graft to the nearest LIVING
					// ancestor so descendants stay in the lineage (rewind archives
					// its source; the rewound child must re-attach where it hung).
					var anchorId = nearestLivingAncestor(parent, r.id, byId, present);
					if (anchorId !== undefined) {
						var list3 = childrenOf.get(anchorId);
						if (list3 === undefined) { list3 = []; childrenOf.set(anchorId, list3); }
						list3.push(r);
					} else {
						roots.push(r);
					}
				} else {
					roots.push(r);
				}
			}
			roots.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
			childrenOf.forEach(function (siblings) {
				siblings.sort(function (a, b) { return a.updatedAt - b.updatedAt; });
			});
			var rootOf = new Map();
			var summaryOf = new Map();
			var marked = new Set();
			function mark(rootId, node) {
				if (marked.has(node.id)) return; // parent cycles must not recurse forever
				marked.add(node.id);
				rootOf.set(node.id, rootId);
				summaryOf.set(node.id, node);
				var kids = childrenOf.get(node.id);
				if (kids === undefined) return;
				for (var k = 0; k < kids.length; k++) mark(rootId, kids[k]);
			}
			for (var m = 0; m < roots.length; m++) mark(roots[m].id, roots[m]);
			// Parent-cycle members are unreachable from any real root; promote
			// them so their lineage never silently vanishes from the panel.
			for (var u = 0; u < rows.length; u++) {
				if (marked.has(rows[u].id) !== true) {
					roots.push(rows[u]);
					mark(rows[u].id, rows[u]);
				}
			}
			return { roots: roots, childrenOf: childrenOf, rootOf: rootOf, summaryOf: summaryOf };
		}

		/** All session ids in a root's lineage (the root plus every descendant). */
		function collectLineage(rootId, childrenOf) {
			var out = [];
			function walk(id) {
				out.push(id);
				var kids = childrenOf.get(id);
				if (kids === undefined) return;
				for (var i = 0; i < kids.length; i++) walk(kids[i].id);
			}
			walk(rootId);
			return out;
		}

		/**
		 * Nearest ancestor of `id` still present in the forest (not archived /
		 * blank / subagent): archiving the branch you stand on should land the
		 * view on the trunk it forked from. Parent links come from the RAW list
		 * (`session.list` keeps returning archived rows, so the chain survives
		 * archived middles); presence is checked against the forest, which only
		 * contains living nodes. Cycle-safe; undefined when no ancestor lives.
		 */
		function nearestPresentAncestor(id, forest, rawById) {
			var byId = rawById !== null && typeof rawById === "object" ? rawById : {};
			var cursor = byId[id];
			var seen = new Set([id]);
			while (cursor !== undefined && cursor !== null) {
				var parentId = cursor.parentId;
				if (parentId === undefined || seen.has(parentId)) return undefined;
				seen.add(parentId);
				if (forest.summaryOf.has(parentId)) return parentId;
				cursor = byId[parentId];
			}
			return undefined;
		}
		//#endregion

		//#region tree layout ---------------------------------------------------
		function laneX(lane) { return LANE_X0 + lane * LANE_GAP; }
		function rowY(index) { return index * ROW_H + ROW_H / 2; }

		/**
		 * Lay one root's expanded lineage out as ordered rows plus the link
		 * geometry (per-lane verticals + parent→branch curves).
		 *
		 * Row order follows the git-graph convention: a branch's rows are
		 * inserted right after the trunk turn it forked from. The seeded
		 * prefix is split by SEQ MATCHING against the parent's turns: a fork
		 * copies the parent's log prefix keeping the original seqs, so the
		 * last child turn whose end seq also appears in the parent's turn
		 * list is the fork point, and every turn after it is this branch's
		 * own. (`session/end-seed` markers cannot do this — compaction
		 * re-seeds the log as well, which used to collapse fully-compacted
		 * sessions into a lone head node.) Lanes are one column per branch,
		 * never shared by siblings: trunk children ALTERNATE sides (first
		 * right, then left…) so the lane block stays balanced around the
		 * trunk, while deeper branches inherit their parent's side and grow
		 * outward (a subtree never spans the trunk). Left-side lanes go
		 * negative; a final normalize pass slides the block 0-based, which
		 * centers the trunk in the canvas.
		 */
		function layoutRoot(rootId, forest, folds, currentId) {
			var rows = [];
			var curves = []; // {fromLane, anchorRow, toLane}
			var nextRight = 0; // right-side lane magnitude (pre-normalize)
			var nextLeft = 0; // left-side lane magnitude (pre-normalize)
			var trunkFlip = 0; // trunk children alternate sides for balance

			/** Last child turn whose end seq also exists in the parent's turn list — the fork anchor, or null. */
			function forkAnchorOf(childTurns, parentEnds) {
				var anchor = null;
				for (var q = 0; q < childTurns.length; q++) {
					if (childTurns[q].endSeq !== null && parentEnds.has(childTurns[q].endSeq)) anchor = childTurns[q].endSeq;
				}
				return anchor;
			}

			function emitBranch(sessionId, lane, parentEnds, side) {
				var summary = summaryOrPlaceholder(forest.summaryOf.get(sessionId), sessionId);
				var fold = folds.get(sessionId);
				var turns = fold !== undefined ? fold.turns : [];
				// Seeded prefix = turns up to (and including) the last one whose
				// end seq matches the parent trunk; own rows are the rest. Roots
				// and orphans (parentEnds undefined) own every turn.
				var anchorIdx = -1;
				if (parentEnds !== undefined) {
					for (var a = 0; a < turns.length; a++) {
						if (turns[a].endSeq !== null && parentEnds.has(turns[a].endSeq)) anchorIdx = a;
					}
				}
				var own = turns.slice(anchorIdx + 1);
				var branchRows = [{
					kind: "head",
					sessionId: sessionId,
					lane: lane,
					label: sessionLabel(summary, fold),
					summary: summary,
					updatedAt: summary.updatedAt,
					running: summary.running === true,
					current: sessionId === currentId,
					loaded: fold !== undefined
				}];
				for (var i = 0; i < own.length; i++) {
					branchRows.push({ kind: "turn", sessionId: sessionId, lane: lane, turn: own[i], summary: summary, current: sessionId === currentId });
				}
				// This branch's full turn-end set (seeded prefix included): a
				// child copies THIS whole log prefix, inherited seqs and all.
				var myEnds = new Set();
				for (var m = 0; m < turns.length; m++) {
					if (turns[m].endSeq !== null) myEnds.add(turns[m].endSeq);
				}
				var children = forest.childrenOf.get(sessionId);
				if (children !== undefined) {
					for (var c = 0; c < children.length; c++) {
						var child = children[c];
						var childFold = folds.get(child.id);
						var anchor = childFold !== undefined ? forkAnchorOf(childFold.turns, myEnds) : null;
						// Left-right balance: trunk children alternate sides;
						// deeper branches inherit their parent's side and grow
						// outward, so a subtree never spans the trunk.
						var childSide = side === 0 ? (trunkFlip++ % 2 === 0 ? 1 : -1) : side;
						var childLane = childSide > 0 ? ++nextRight : -(++nextLeft);
						var childRows = emitBranch(child.id, childLane, myEnds, childSide);
						var at = 1; // fallback: right after the branch head
						for (var r = 0; r < branchRows.length; r++) {
							var row = branchRows[r];
							if (row.kind === "turn" && row.turn.endSeq !== null && row.turn.endSeq === anchor) { at = r + 1; break; }
						}
						var spliced = branchRows.slice(0, at).concat(childRows, branchRows.slice(at));
						branchRows = spliced;
						// Anchor by row OBJECT, not index: later splices shift
						// indexes, and nested branches record local indexes that
						// never match the final row order.
						curves.push({ fromLane: lane, anchorRow: branchRows[at - 1], toLane: childLane });
					}
				}
				return branchRows;
			}

			rows = emitBranch(rootId, 0, undefined, 0);
			// Normalize: left-side lanes are negative; sliding the whole block
			// by -minLane makes every x non-negative and puts the trunk near
			// the CENTER of the lane block (no left branches → unchanged).
			var minLane = 0, maxLane = 0;
			for (var s = 0; s < rows.length; s++) {
				if (rows[s].lane < minLane) minLane = rows[s].lane;
				if (rows[s].lane > maxLane) maxLane = rows[s].lane;
			}
			var trunkLane = -minLane;
			for (var g = 0; g < rows.length; g++) {
				rows[g].lane -= minLane;
				rows[g].trunkLane = trunkLane;
				rows[g].index = g;
			}
			for (var v = 0; v < curves.length; v++) {
				curves[v].fromLane -= minLane;
				curves[v].toLane -= minLane;
			}

			var laneExtents = new Map();
			for (var q = 0; q < rows.length; q++) {
				var lane = rows[q].lane;
				var ext = laneExtents.get(lane);
				if (ext === undefined) { ext = { first: q, last: q }; laneExtents.set(lane, ext); }
				else if (q > ext.last) ext.last = q;
			}
			return { rows: rows, laneExtents: laneExtents, curves: curves, laneCount: maxLane - minLane + 1, trunkLane: trunkLane };
		}
		//#endregion

		//#region misc helpers --------------------------------------------------
		function relTime(ts, now) {
			if (typeof ts !== "number") return "";
			var delta = Math.max(0, now - ts) / 1000;
			if (delta < 60) return "刚刚";
			if (delta < 3600) return Math.floor(delta / 60) + " 分钟前";
			if (delta < 86400) return Math.floor(delta / 3600) + " 小时前";
			if (delta < 86400 * 30) return Math.floor(delta / 86400) + " 天前";
			var date = new Date(ts);
			return (date.getMonth() + 1) + "/" + date.getDate();
		}

		/** "MM-DD HH:mm" for tooltip metadata. */
		function formatTime(ts) {
			var d = new Date(ts);
			var pad = function (n) { return n < 10 ? "0" + n : String(n); };
			return (d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
		}

		/**
		 * Hit-test a drag pointer against a tree row of a DIFFERENT session.
		 * The ghost overlay is pointer-events:none, so the stack is the live
		 * canvas. Same-session hits return empty — drop target is a branch,
		 * not a turn on the source.
		 */
		function hitDragTarget(clientX, clientY, sourceId) {
			var empty = { targetId: null, snapX: null, snapY: null };
			if (typeof document === "undefined") return empty;
			var stack;
			if (typeof document.elementsFromPoint === "function") {
				stack = document.elementsFromPoint(clientX, clientY);
			} else {
				var one = document.elementFromPoint(clientX, clientY);
				stack = one !== null ? [one] : [];
			}
			var rowEl = null;
			for (var i = 0; i < stack.length; i++) {
				var n = stack[i];
				if (n !== null && typeof n.closest === "function") {
					var hit = n.closest("[data-dst-session]");
					if (hit !== null) { rowEl = hit; break; }
				}
			}
			if (rowEl === null) return empty;
			var id = rowEl.getAttribute("data-dst-session");
			if (id === null || id === sourceId) return empty;
			var mark = rowEl.querySelector(".dsh-st-dot, .dsh-st-headmark");
			var snapX = null, snapY = null;
			if (mark !== null) {
				var r = mark.getBoundingClientRect();
				snapX = r.left + r.width / 2;
				snapY = r.top + r.height / 2;
			}
			return { targetId: id, snapX: snapX, snapY: snapY };
		}
		//#endregion

		//#region components ----------------------------------------------------
		var useOpen = function () { return React.useSyncExternalStore(subscribeOpen, snapshotOpen); };

		/** Inline SVG tree glyph — no emoji-font dependency, renders anywhere. */
		var TREE_ICON = el("svg", {
			width: "16", height: "16", viewBox: "0 0 16 16", fill: "none",
			stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round",
			"aria-hidden": "true", key: "icon"
		},
			el("path", { d: "M8 14V6", key: "l1" }),
			el("path", { d: "M8 9L3.5 6.5", key: "l2" }),
			el("path", { d: "M8 6.5L12.5 4", key: "l3" }),
			el("circle", { cx: "8", cy: "4", r: "2", key: "c1" }),
			el("circle", { cx: "3", cy: "5.5", r: "1.6", key: "c2" }),
			el("circle", { cx: "13", cy: "3", r: "1.6", key: "c3" }),
			el("circle", { cx: "8", cy: "14.5", r: "1.4", key: "c4" })
		);

		/** Git-branch glyph for the fork action (SVG: no font dependency). */
		var FORK_ICON = el("svg", {
			width: "14", height: "14", viewBox: "0 0 24 24", fill: "none",
			stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round",
			"aria-hidden": "true", key: "icon"
		},
			el("line", { x1: "6", y1: "3", x2: "6", y2: "15", key: "l" }),
			el("circle", { cx: "18", cy: "6", r: "3", key: "c1" }),
			el("circle", { cx: "6", cy: "18", r: "3", key: "c2" }),
			el("path", { d: "M18 9a9 9 0 0 1-9 9", key: "b" })
		);

		/** Counterclockwise arrow for rewind (SVG: no font dependency). */
		var REWIND_ICON = el("svg", {
			width: "14", height: "14", viewBox: "0 0 24 24", fill: "none",
			stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round",
			"aria-hidden": "true", key: "icon"
		},
			el("path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", key: "a" }),
			el("path", { d: "M3 3v5h5", key: "h" })
		);

		/** Line-style trash glyph for the archive action (SVG: no font dependency). */
		var TRASH_ICON = el("svg", {
			width: "14", height: "14", viewBox: "0 0 24 24", fill: "none",
			stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round",
			"aria-hidden": "true", key: "icon"
		},
			el("path", { d: "M3 6h18", key: "lid" }),
			el("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", key: "body" }),
			el("path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", key: "handle" }),
			el("line", { x1: "10", y1: "11", x2: "10", y2: "17", key: "r1" }),
			el("line", { x1: "14", y1: "11", x2: "14", y2: "17", key: "r2" })
		);

		/** Git-merge glyph for branch handoff (SVG: no font dependency). */
		var HANDOFF_ICON = el("svg", {
			width: "14", height: "14", viewBox: "0 0 24 24", fill: "none",
			stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round",
			"aria-hidden": "true", key: "icon"
		},
			el("circle", { cx: "18", cy: "18", r: "3", key: "c1" }),
			el("circle", { cx: "6", cy: "6", r: "3", key: "c2" }),
			el("path", { d: "M6 21V9a9 9 0 0 0 9 9", key: "m" })
		);

		/** Sidebar footer action: the panel's toggle. Owns a whole footer row —
		 * the stock footer-actions container is a single NON-wrapping flex
		 * line, so a full-width sibling (e.g. the usage-stats badge) would
		 * push this entry past the clipped edge, leaving a border sliver. */
		function TreeToggle(props) {
			var open = useOpen();
			var wide = props.wide === true;
			var rowRef = React.useRef(null);
			// Enable wrapping on the owning flex row (walking up past the
			// display:contents slot anchors). Inline-style patch, restored on
			// unmount; the host manages that row through classes only, so the
			// two never fight over the property.
			React.useEffect(function () {
				// Start ABOVE this row (it is itself display:flex).
				var node = rowRef.current !== null ? rowRef.current.parentElement : null;
				while (node !== null) {
					var display = window.getComputedStyle(node).display;
					if (display === "flex" || display === "inline-flex") break;
					node = node.parentElement;
				}
				if (node === null || node.style.flexWrap !== "") return;
				node.style.flexWrap = "wrap";
				return function () {
					if (node.style.flexWrap === "wrap") node.style.flexWrap = "";
				};
			}, []);
			return el("div", {
				className: "dsh-st-footrow",
				ref: rowRef,
				style: wide === true ? null : { flex: "0 0 auto", width: "auto" },
				key: "row"
			},
				el("button", {
					className: "dsh-st-footbtn" + (open ? " on" : "") + (wide === true ? " wide" : ""),
					onClick: function (event) { event.preventDefault(); setPanelOpen(!open); },
					title: open ? "关闭会话树" : "打开会话树",
					"aria-label": open ? "关闭会话树" : "打开会话树"
				},
					TREE_ICON,
					wide === true ? el("span", { key: "t" }, "会话树") : null
				)
			);
		}

		/** One turn / head row inside an expanded root. */
		function TreeRowImpl(props) {
			var row = props.row;
			var busy = props.busy;
			var onFork = props.onFork;
			var onOpen = props.onOpen;
			var onHover = props.onHover;
			var onArchive = props.onArchive;
			var onNodePointerDown = props.onNodePointerDown;
			var running = row.summary !== undefined && row.summary.running === true;

			var dotClass = "dsh-st-dot";
			if (row.kind === "head") dotClass = "dsh-st-headmark";
			else if (row.kind === "turn" && row.turn.endSeq === null) dotClass += " open";
			var rowClass = "dsh-st-row" + (row.current === true ? " current" : "") + (running === true ? " running" : "") + (row.pinned === true ? " pinned" : "") + (row.inRange === true ? " in-range" : "") + (row.dragSource === true ? " drag-source" : "") + (row.dropTarget === true ? " drop-target" : "");

			// The canvas is text-free: turn rows and branch heads are pure graph
			// nodes — titles, message content, running/current state all show in
			// the hover tooltip only. (The collapsed root bars outside the canvas
			// keep their names — they are the navigation entries.)

			// Row glyphs are the quick path; the same actions also live inside
			// the hover tooltip where they are self-describing.
			var actions = null;
			if (row.kind === "head") {
				actions = el("span", { className: "dsh-st-actions", key: "acts" },
					el("button", {
						className: "dsh-st-act danger",
						disabled: busy !== null || running === true,
						title: running === true ? "会话运行中，暂不可删除" : "删除该分支（归档，日志保留）",
						onClick: function (event) { event.stopPropagation(); onArchive(row.sessionId); }
					}, TRASH_ICON)
				);
			} else if (row.turn.endSeq !== null && row.turn.userText !== "") {
				// The stock fork RPC refuses to cut inside an open turn, so only
				// completed turns with a user prompt are forkable anchors.
				// Running does NOT block fork/rewind: the log is append-only,
				// so the prefix up to a completed turn/end is immutable while
				// the session streams new tail events — the server-side fork
				// handler enforces exactly this and nothing more. (Archive of
				// a running session stays gated below.)
				actions = el("span", { className: "dsh-st-actions", key: "acts" },
					el("button", {
						className: "dsh-st-act",
						disabled: busy !== null,
						title: "从此处创建新分支",
						onClick: function (event) { event.stopPropagation(); onFork(row.sessionId, row.turn.endSeq, false); }
					}, FORK_ICON),
					// Rewind cuts BEFORE the turn (startSeq-1): the turn AND every later
					// event drop out of the rewound view — Claude Code / pi-style "undo
					// this exchange", not "keep through it". (Cutting at endSeq would
					// keep the turn, so rewinding the latest round = visible no-op.)
					// Any branch's turn, not just the CURRENT session: rewind of a
					// non-current branch archives that branch and opens the rewound child.
					row.turn.startSeq > 0 ? el("button", {
						className: "dsh-st-act rewind",
						disabled: busy !== null,
						title: "撤回此轮：丢弃该轮及其之后的消息，回到发送前（旧内容自动归档保留，可恢复）",
						onClick: function (event) { event.stopPropagation(); onFork(row.sessionId, row.turn.startSeq - 1, true); }
					}, REWIND_ICON) : null
				);
			}

			var ariaLabel = row.kind === "head"
				? "分支 " + row.label + (running === true ? "，运行中" : "")
				: "第 " + row.turn.turn + " 轮" + (row.turn.userText !== "" ? "：" + row.turn.userText.slice(0, 40) : "");

			return el("div", {
				className: rowClass,
				style: {
					top: (row.index * ROW_H) + "px", height: ROW_H + "px",
					"--dsh-st-lane": laneColor(row.lane, row.trunkLane)
				},
				"data-dst-session": row.sessionId,
				"data-dst-kind": row.kind,
				"data-dst-seq": row.kind === "head" ? "h" : String(row.turn.startSeq),
				tabIndex: 0,
				role: "button",
				"aria-label": ariaLabel,
				onClick: function () { onOpen(row.sessionId); },
				onKeyDown: function (event) {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						onOpen(row.sessionId);
					} else if (event.key === "Escape") {
						onHover(null, null);
					}
				},
				onMouseEnter: function (event) { onHover(row, event.currentTarget); },
				onMouseLeave: function () { onHover(null, null); }
			},
				// The circle is the handoff HANDLE: drag it onto another lane
				// to drop; a click (no drag) still pins it as source so a range
				// or the tooltip fallback can finish the job. stopPropagation
				// keeps the row-open click out of the way.
				el("span", {
					className: dotClass, style: { left: laneX(row.lane) + "px" }, key: "dot",
					title: row.pinned === true ? "已选为移交源，拖到目标分支或点此取消" : "拖到目标分支移交，或点选为移交源",
					onPointerDown: function (event) { event.stopPropagation(); onNodePointerDown(row, event); },
					onDragStart: function (event) { event.preventDefault(); }
				}),
				actions
			);
		}

		/**
		 * Hover tooltip: the node's text content + its actions. Viewport-fixed
		 * (never clipped by the panel's scroll container), flipped to the left
		 * when it would overflow the right edge, measured in a layout pass to
		 * clamp vertically. Sticky: entering the tooltip cancels the row-leave
		 * hide, so the buttons inside are clickable.
		 */
		function TooltipImpl(props) {
			var row = props.row;
			var anchor = props.anchor;
			var busy = props.busy;
			var onFork = props.onFork;
			var onArchive = props.onArchive;
			var pinnedSession = props.pinnedSession;
			var pinnedLabel = props.pinnedLabel;
			var onPinSource = props.onPinSource;
			var onHandoffTarget = props.onHandoffTarget;
			var onTipEnter = props.onTipEnter;
			var onTipLeave = props.onTipLeave;
			var ref = React.useRef(null);
			var posState = React.useState({ left: anchor.x + 24, top: anchor.y - 4, ready: false }); // measured in layout pass below
			var pos = posState[0];
			var setPos = posState[1];

			React.useLayoutEffect(function () {
				var node = ref.current;
				if (node === null) return;
				var vw = window.innerWidth;
				var vh = window.innerHeight;
				var w = node.offsetWidth;
				var h = node.offsetHeight;
				var left = anchor.x + 24;
				if (left + w > vw - 8) left = Math.max(8, anchor.x - w - 16);
				if (left + w > vw - 8) left = Math.max(8, vw - w - 8);
				// Prefer BELOW the row: a side-aligned bubble can span the row's
				// full width and cover the hover-revealed quick actions at its
				// right edge, swallowing clicks meant for them.
				var top = anchor.y + ROW_H + 6;
				if (top + h > vh - 8) top = anchor.y - h - 6;
				if (top < 8 || top + h > vh - 8) top = Math.max(8, vh - h - 8);
				setPos({ left: left, top: top, ready: true });
			}, [anchor.x, anchor.y, row]);

			var running = row.summary !== undefined && row.summary.running === true;
			var meta;
			var body;
			if (row.kind === "head") {
				meta = (running === true ? "运行中 · " : "") + "分支头 · " + relTime(row.updatedAt, Date.now()) + " · 点击行打开该会话";
				body = row.label;
			} else {
				var time = typeof row.turn.time === "number" ? formatTime(row.turn.time) : "";
				meta = "第 " + row.turn.turn + " 轮" + (time !== "" ? " · " + time : "") +
					(row.turn.endSeq === null ? " · 进行中" : "") + " · 点击行打开所属会话";
				body = row.turn.userText !== "" ? row.turn.userText : "（该轮无文本输入，如斜杠命令或纯图片）";
			}

			var actionEls = [];
			if (row.kind === "head") {
				// Handoff is a two-step pick: with NO source pinned this button
				// pins this node (whole branch on a head); with a pin set and a
				// DIFFERENT branch hovered it becomes the direct target action.
				// The confirm bar keeps a dropdown to re-pick the target.
				if (pinnedSession !== undefined && pinnedSession !== row.sessionId) {
					actionEls.push(el("button", {
						className: "dsh-st-tipbtn", key: "handoff-direct",
						disabled: busy !== null,
						title: "把已选源「" + (pinnedLabel || "") + "」相对该分支的差异轮次作为一条消息发进来,由该分支的模型消化后继续",
						onClick: function (event) { event.stopPropagation(); onHandoffTarget(row.sessionId); }
					}, HANDOFF_ICON, el("span", { key: "label" }, "移交「" + clampLabel(pinnedLabel, 12) + "」到此分支")));
					actionEls.push(el("button", {
						className: "dsh-st-tipbtn", key: "repin",
						disabled: busy !== null,
						title: "改选该分支为移交源（整支成果）",
						onClick: function (event) { event.stopPropagation(); onPinSource(row); }
					}, HANDOFF_ICON, el("span", { key: "label" }, "改选为源")));
				} else if (pinnedSession === row.sessionId && row.pinned !== true) {
					actionEls.push(el("button", {
						className: "dsh-st-tipbtn", key: "range",
						disabled: busy !== null,
						title: "把已选点与此节点之间的轮次划为移交区间（含两端）",
						onClick: function (event) { event.stopPropagation(); onPinSource(row); }
					}, HANDOFF_ICON, el("span", { key: "label" }, "划到此节点")));
				} else {
					actionEls.push(el("button", {
						className: "dsh-st-tipbtn", key: "pin",
						disabled: busy !== null,
						title: row.pinned === true ? "取消选源" : "选该分支为移交源（整支成果），再拖到目标分支",
						onClick: function (event) { event.stopPropagation(); onPinSource(row); }
					}, HANDOFF_ICON, el("span", { key: "label" }, row.pinned === true ? "取消选源" : "选为移交源")));
				}
				actionEls.push(el("button", {
					className: "dsh-st-tipbtn danger", key: "del",
					disabled: busy !== null || running === true,
					title: running === true ? "会话运行中，暂不可删除" : "归档该分支：从列表隐藏，会话日志保留，可恢复",
					onClick: function (event) { event.stopPropagation(); onArchive(row.sessionId); }
				}, TRASH_ICON, el("span", { key: "label" }, "删除该分支")));
			} else if (row.turn.endSeq !== null) {
				if (row.turn.userText !== "") {
					// Running does not gate fork/rewind here either — completed-
					// turn prefixes are immutable under the append-only log, so a
					// cut is consistent even while the session streams (see the
					// matching note in TreeRowImpl).
					actionEls.push(el("button", {
						className: "dsh-st-tipbtn", key: "fork",
						disabled: busy !== null,
						title: "在该轮的分叉点创建新分支并打开",
						onClick: function (event) { event.stopPropagation(); onFork(row.sessionId, row.turn.endSeq, false); }
					}, FORK_ICON, el("span", { key: "label" }, "从此创建分支")));
					// Undo semantics (Claude Code / pi rewind): cut BEFORE the turn so it
					// and everything after disappears from the rewound view; the plugin
					// then inherits the title and archives the abandoned path (see
					// forkAt below), so it reads as an in-place undo, not a new session.
					if (row.turn.startSeq > 0) {
						actionEls.push(el("button", {
							className: "dsh-st-tipbtn rewind", key: "rewind",
							disabled: busy !== null,
							title: "丢弃该轮及其之后的消息，回到发送前（同名新分支延续，旧内容自动归档保留、可恢复）",
							onClick: function (event) { event.stopPropagation(); onFork(row.sessionId, row.turn.startSeq - 1, true); }
						}, REWIND_ICON, el("span", { key: "label" }, "撤回此轮")));
					}
				}
				if (pinnedSession !== undefined && pinnedSession !== row.sessionId) {
					actionEls.push(el("button", {
						className: "dsh-st-tipbtn", key: "handoff-direct",
						disabled: busy !== null,
						title: "把已选源「" + (pinnedLabel || "") + "」的差异轮次作为一条消息发进该分支,由其模型消化后继续",
						onClick: function (event) { event.stopPropagation(); onHandoffTarget(row.sessionId); }
					}, HANDOFF_ICON, el("span", { key: "label" }, "移交「" + clampLabel(pinnedLabel, 12) + "」到此分支")));
					actionEls.push(el("button", {
						className: "dsh-st-tipbtn", key: "repin",
						disabled: busy !== null,
						title: "改选该分支为移交源（截至此轮，含）",
						onClick: function (event) { event.stopPropagation(); onPinSource(row); }
					}, HANDOFF_ICON, el("span", { key: "label" }, "改选为源")));
				} else if (pinnedSession === row.sessionId && row.pinned !== true) {
					actionEls.push(el("button", {
						className: "dsh-st-tipbtn", key: "range",
						disabled: busy !== null,
						title: "把已选点与此轮之间的内容划为移交区间（含两端）",
						onClick: function (event) { event.stopPropagation(); onPinSource(row); }
					}, HANDOFF_ICON, el("span", { key: "label" }, "划到此轮")));
				} else {
					actionEls.push(el("button", {
						className: "dsh-st-tipbtn", key: "pin",
						disabled: busy !== null,
						title: row.pinned === true ? "取消选源" : "选该分支为移交源（截至此轮，含），再拖到目标分支",
						onClick: function (event) { event.stopPropagation(); onPinSource(row); }
					}, HANDOFF_ICON, el("span", { key: "label" }, row.pinned === true ? "取消选源" : "选为移交源")));
				}
			}
			if (actionEls.length === 0) actionEls = null;

			return el("div", {
				className: "dsh-st-tip", ref: ref,
				style: {
					left: pos.left + "px", top: pos.top + "px",
					visibility: pos.ready === true ? "visible" : "hidden",
					"--dsh-st-lane": laneColor(row.lane, row.trunkLane)
				},
				onMouseEnter: function () { onTipEnter(); },
				onMouseLeave: function () { onTipLeave(); }
			},
				el("div", { className: "dsh-st-tip-meta", key: "meta" }, meta),
				el("div", { className: "dsh-st-tip-body", key: "body" }, body),
				actionEls !== null ? el("div", { className: "dsh-st-tip-actions", key: "acts" }, actionEls) : null
			);
		}

		/** Link layer: per-lane verticals + branch curves, drawn behind rows.
		 * Every stroke carries its lane's identity hue; the curve into the
		 * CURRENT session's head gets full opacity and extra weight. */
		function TreeLinksImpl(props) {
			var layout = props.layout;
			var dropTargetId = props.dropTargetId;
			var dropLanes = new Set();
			if (dropTargetId !== undefined && dropTargetId !== null) {
				for (var d = 0; d < layout.rows.length; d++) {
					if (layout.rows[d].sessionId === dropTargetId) dropLanes.add(layout.rows[d].lane);
				}
			}
			var height = layout.rows.length * ROW_H;
			var width = laneX(layout.laneCount) + 12;
			var children = [];
			layout.laneExtents.forEach(function (ext, lane) {
				var isDrop = dropLanes.has(lane);
				children.push(el("line", {
					key: "l" + lane,
					x1: laneX(lane), y1: rowY(ext.first),
					x2: laneX(lane), y2: rowY(ext.last),
					stroke: laneColor(lane, layout.trunkLane),
					strokeWidth: isDrop === true ? 2.75 : 1.5,
					opacity: isDrop === true ? 1 : (lane === layout.trunkLane ? 0.55 : 0.85)
				}));
			});
			for (var i = 0; i < layout.curves.length; i++) {
				var curve = layout.curves[i];
				var anchorRow = curve.anchorRow !== undefined ? curve.anchorRow : layout.rows[0];
				var headRow = null;
				for (var r = 0; r < layout.rows.length; r++) {
					if (layout.rows[r].kind === "head" && layout.rows[r].lane === curve.toLane) { headRow = layout.rows[r]; break; }
				}
				if (headRow === null) continue;
				var x1 = laneX(curve.fromLane), y1 = rowY(anchorRow.index);
				var x2 = laneX(curve.toLane), y2 = rowY(headRow.index);
				var mid = (x1 + x2) / 2;
				var toDrop = dropLanes.has(curve.toLane) === true || dropLanes.has(curve.fromLane) === true;
				children.push(el("path", {
					key: "c" + i,
					d: "M " + x1 + " " + y1 + " C " + mid + " " + y1 + ", " + mid + " " + y2 + ", " + x2 + " " + y2,
					fill: "none",
					stroke: laneColor(curve.toLane, layout.trunkLane),
					strokeWidth: toDrop === true ? 2.5 : (headRow.current === true ? 2 : 1.5),
					opacity: toDrop === true || headRow.current === true ? 1 : 0.8
				}));
			}
			return el("svg", { className: "dsh-st-svg", width: width, height: height, key: "links" }, children);
		}

		/** One root: collapsed card or the expanded git-graph canvas. */
		function RootSectionImpl(props) {
			var root = props.root;
			var forest = props.forest;
			var folds = props.folds;
			var currentId = props.currentId;
			var expanded = props.expanded;
			var onToggleExpand = props.onToggleExpand;
			var onFork = props.onFork;
			var onOpen = props.onOpen;
			var onHover = props.onHover;
			var onArchive = props.onArchive;
			var onNodePointerDown = props.onNodePointerDown;
			var pinnedSession = props.pinnedSession;
			var pinnedCut = props.pinnedCut;
			var pinnedFrom = props.pinnedFrom;
			var dragSourceId = props.dragSourceId;
			var dropTargetId = props.dropTargetId;
			var busy = props.busy;
			var now = props.now;

			var isExpanded = expanded.has(root.id);
			var branchCount = collectLineage(root.id, forest.childrenOf).length - 1;
			var fold = folds.get(root.id);
			var name = sessionLabel(root, fold);
			var isCurrentRoot = currentId !== undefined && forest.rootOf.get(currentId) === root.id;

			var bar = el("div", { className: "dsh-st-rootbar", key: "bar", onClick: function () { onToggleExpand(root.id); } },
				el("span", { className: "dsh-st-caret", key: "c" }, "▸"),
				el("span", { className: "dsh-st-rootname", key: "n", title: name }, name),
				isCurrentRoot === true ? el("span", { className: "dsh-st-badge", key: "cur" }, "当前") : null,
				el("span", { className: "dsh-st-rootmeta", key: "m" },
					branchCount > 0 ? branchCount + " 分支 · " : "", relTime(root.updatedAt, now))
			);

			var body = null;
			if (isExpanded === true) {
				if (fold === undefined) {
					body = el("div", { className: "dsh-st-loading", key: "loading" }, "加载分支数据…");
				} else {
					var layout = layoutRoot(root.id, forest, folds, currentId);
					var height = layout.rows.length * ROW_H;
					var rowEls = layout.rows.map(function (row) {
						// Pinned handoff source: endpoints glow; interior turns of a
						// same-branch range get a quieter in-range mark.
						row.pinned = false;
						row.inRange = false;
						row.dragSource = dragSourceId !== undefined && row.sessionId === dragSourceId;
						row.dropTarget = dropTargetId !== undefined && row.sessionId === dropTargetId;
						if (pinnedSession !== undefined && row.sessionId === pinnedSession) {
							var fromCut = pinnedFrom;
							var toCut = pinnedCut;
							if (row.kind === "head") {
								row.pinned = toCut === null;
							} else if (row.kind === "turn" && row.turn.endSeq !== null) {
								var end = row.turn.endSeq;
								var atFrom = fromCut !== null && end === fromCut;
								var atTo = toCut !== null && end === toCut;
								row.pinned = atFrom || atTo;
								// Whole-branch pin (no bounds) only glows the head — don't
								// wash every turn. Interior glow is for a real window.
								row.inRange = row.pinned !== true && (fromCut !== null || toCut !== null)
									&& (fromCut === null || end >= fromCut) && (toCut === null || end <= toCut);
							}
						}
						return el(TreeRow, {
							// Stable across relayouts: splice shifts indexes, but
							// session + turn startSeq (or head) never move.
							key: row.sessionId + ":" + (row.kind === "head" ? "h" : "t" + row.turn.startSeq),
							row: row,
							busy: busy,
							onFork: onFork,
							onOpen: onOpen,
							onHover: onHover,
							onArchive: onArchive,
							onNodePointerDown: onNodePointerDown
						});
					});
					// The lane block is width-fixed and flex-centered, so every
					// tree sits in the middle of the panel regardless of how few
					// lanes it has (rows/svg are absolute within the canvas).
					// The width reserves a right-hand ACTION ZONE: hover
					// buttons sit at right:6 and span up to ~56px (two 24px
					// buttons + gap + inset), which used to overlap the last
					// lane's dots on narrow trees.
					var laneSpan = laneX(layout.laneCount - 1) + 12 + 60;
					var canvas = el("div", { className: "dsh-st-canvas", style: { height: height + "px", width: laneSpan + "px" }, key: "canvas" },
						el(TreeLinks, { layout: layout, dropTargetId: dropTargetId, key: "links" }),
						rowEls
					);
					body = el("div", { className: "dsh-st-canvas-wrap", key: "wrap" }, canvas);
				}
			}

			return el("div", { className: "dsh-st-root" + (isExpanded === true ? " expanded" : "") },
				bar,
				body
			);
		}

		/** Viewport-fixed ghost curve + cursor chip while a handoff drag is live. */
		function DragGhostImpl(props) {
			var drag = props.drag;
			var targetLabel = props.targetLabel;
			if (drag === null || drag.active !== true) return null;
			var x1 = drag.originX;
			var y1 = drag.originY;
			var x2 = drag.snapX !== null && drag.snapX !== undefined ? drag.snapX : drag.x;
			var y2 = drag.snapY !== null && drag.snapY !== undefined ? drag.snapY : drag.y;
			var mid = (x1 + x2) / 2;
			var color = drag.color !== undefined ? drag.color : "var(--dsw-alias-brand-primary,#4d86f8)";
			var path = "M " + x1 + " " + y1 + " C " + mid + " " + y1 + ", " + mid + " " + y2 + ", " + x2 + " " + y2;
			var hasTarget = drag.targetId !== null && drag.targetId !== undefined;
			var chipText = hasTarget === true
				? "松手移交到「" + clampLabel(targetLabel, 16) + "」"
				: "拖到目标分支";
			var chipLeft = drag.x + 16;
			var chipTop = drag.y + 16;
			if (typeof window !== "undefined") {
				if (chipLeft > window.innerWidth - 188) chipLeft = drag.x - 172;
				if (chipTop > window.innerHeight - 36) chipTop = drag.y - 36;
				if (chipLeft < 8) chipLeft = 8;
				if (chipTop < 8) chipTop = 8;
			}
			return el("div", { style: { pointerEvents: "none" }, key: "drag" },
				el("svg", { className: "dsh-st-draglayer", key: "g" },
					el("path", {
						d: path, fill: "none", stroke: color, strokeWidth: 2,
						strokeDasharray: "7 5", strokeLinecap: "round", opacity: 0.95, key: "p"
					}),
					el("circle", { cx: x1, cy: y1, r: 4.5, fill: color, key: "a" }),
					el("circle", {
						cx: x2, cy: y2, r: 6, fill: "var(--dsw-alias-bg-layer-1,#1b1b1f)",
						stroke: color, strokeWidth: 2, key: "b"
					})
				),
				el("div", {
					className: "dsh-st-dragchip", key: "c",
					style: { left: chipLeft + "px", top: chipTop + "px", "--dsh-st-lane": color }
				}, chipText)
			);
		}

		/**
		 * Render-phase diagnostic wrapper: shows the crash in-DOM instead of a
		 * silent slot error boundary cell. (Kept permanently — a tree panel
		 * that dies with a stack trace beats one that disappears.) Every
		 * component in the panel tree gets one because React renders child
		 * elements outside the parent's call frame.
		 *
		 * WRAPPING CONTRACT: a guarded component must keep ALL its hooks
		 * unconditional and at the top — a throw between two hook calls would
		 * desync React's hook chain for that instance. Event-handler throws are
		 * NOT caught here (they never were; handlers own their try/catch).
		 */
		function guard(name, Comp) {
			var Wrapped = function (props) {
				try {
					return Comp(props);
				} catch (err) {
					var text = err !== null && typeof err === "object" && typeof err.stack === "string" ? err.stack : String(err);
					return el("div", { className: "dsh-st-error", style: { margin: "12px", whiteSpace: "pre-wrap" }, "data-dsh-tree-crash": name }, name + " → " + text);
				}
			};
			return Wrapped;
		}

		var TreeRow = guard("TreeRow", TreeRowImpl);
		var Tooltip = guard("Tooltip", TooltipImpl);
		var TreeLinks = guard("TreeLinks", TreeLinksImpl);
		var RootSection = guard("RootSection", RootSectionImpl);
		var DragGhost = guard("DragGhost", DragGhostImpl);
		var SafePanel = guard("TreePanel", TreePanelImpl);

		/** The right-side panel itself (rendered into the shell overlay). */
		function TreePanelImpl(props) {
			var useSessions = props.useSessions;
			var onForkAction = props.forkAt;
			var onArchiveAction = props.archiveBranch;
			var onHandoffAction = props.handoffTo;
			var onOpenSession = props.openSession;

			var list = useSessions(function (s) { return s; });
			// GlobalStandardProps guarantees both hooks on root-scope entries;
			// call unconditionally (a conditional hook call breaks React's
			// hook-count invariant if the prop ever flips mid-mount).
			var workspaceList = props.useWorkspaces(function (s) { return s; });
			var archivedIds = workspaceList !== null && typeof workspaceList === "object" && Array.isArray(workspaceList.archivedSessionIds)
				? workspaceList.archivedSessionIds
				: EMPTY_ARCHIVED;
			var open = useOpen();
			var expandedState = React.useState(null);
			var expanded = expandedState[0];
			var setExpanded = expandedState[1];
			var turnDataState = React.useState(new Map());
			var turnData = turnDataState[0];
			var setTurnData = turnDataState[1];
			var refreshState = React.useState(0);
			var refreshTick = refreshState[0];
			var bumpRefresh = refreshState[1];
			var busyState = React.useState(null);
			var busy = busyState[0];
			var setBusy = busyState[1];
			var errorState = React.useState("");
			var error = errorState[0];
			var setError = errorState[1];
			var bodyRef = React.useRef(null);
			var panelRef = React.useRef(null);
			// Dock, don't cover: while open, inset the shell frame (the grid
			// ancestor behind the overlay layer) by the panel's measured width
			// so the conversation column reflows BESIDE the panel. Lookup is
			// structural (host classes are build-hashed); without a grid
			// ancestor the panel degrades to the old covering overlay.
			React.useEffect(function () {
				if (open !== true) return;
				var panel = panelRef.current;
				if (panel === null) return;
				var frame = null;
				for (var node = panel.parentElement; node !== null && node !== document.documentElement; node = node.parentElement) {
					if (window.getComputedStyle(node).display === "grid") { frame = node; break; }
				}
				if (frame === null) return;
				var prev = frame.style.paddingRight;
				var apply = function () {
					frame.style.paddingRight = panel.getBoundingClientRect().width + "px";
				};
				apply();
				window.addEventListener("resize", apply);
				return function () {
					window.removeEventListener("resize", apply);
					frame.style.paddingRight = prev;
				};
			}, [open]);
			var hoverTimer = React.useRef(null);
			var hoverOpenedAt = React.useRef(0);
			// Clear the pending hide timer on unmount (post-unmount setHover is
			// a silent no-op in React 18, this is belt-and-braces hygiene).
			React.useEffect(function () {
				return function () {
					if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
				};
			}, []);
			var hoverState = React.useState(null);
			var hover = hoverState[0];
			var setHover = hoverState[1];
			var dragState = React.useState(null);
			var drag = dragState[0];
			var setDrag = dragState[1];
			var dragRef = React.useRef(null);
			var dragRaf = React.useRef(0);
			var dragCleanup = React.useRef(null);
			React.useEffect(function () {
				return function () {
					if (dragRaf.current !== 0) cancelAnimationFrame(dragRaf.current);
					if (dragCleanup.current !== null) dragCleanup.current();
				};
			}, []);
			React.useEffect(function () {
				if (open === true) return;
				if (dragCleanup.current !== null) dragCleanup.current();
				dragRef.current = null;
				if (dragRaf.current !== 0) {
					cancelAnimationFrame(dragRaf.current);
					dragRaf.current = 0;
				}
				setDrag(null);
			}, [open]);

			var forest = React.useMemo(function () { return buildForest(list, archivedIds); }, [list.ids, list.byId, archivedIds]);
			var currentId = list.current;

			function cacheKey(id) {
				var summary = forest.summaryOf.get(id);
				var updated = summary !== undefined ? summary.updatedAt : 0;
				return id + "@" + updated + "@" + refreshTick;
			}

			// The panel shows exactly ONE tree: the current session's lineage.
			// When the current session moves to another lineage, re-target.
			var currentRootId = currentId !== undefined ? forest.rootOf.get(currentId) : undefined;
			React.useEffect(function () {
				if (open !== true || currentRootId === undefined) return;
				setExpanded(function (prev) {
					if (prev !== null && prev.has(currentRootId)) return prev;
					return new Set([currentRootId]);
				});
			}, [open, currentRootId]);

			// Lazy-load turn data, one session at a time. Per-id inflight
			// dedup makes re-runs idempotent (forest identity churn from list
			// pushes used to cancel-and-refetch whole batches); each result
			// lands under its own key and evicts the same session's stale keys.
			var inflight = React.useRef(new Set());
			React.useEffect(function () {
				if (open !== true || expanded === null) return;
				var api = props.apiRef.api;
				expanded.forEach(function (rootId) {
					collectLineage(rootId, forest.childrenOf).forEach(function (id) {
						var key = cacheKey(id);
						if (turnData.has(key) || inflight.current.has(key)) return;
						inflight.current.add(key);
						fetchAllEvents(api, id).then(function (events) {
							setTurnData(function (prev) {
								var next = new Map(prev);
								next.forEach(function (_v, oldKey) {
									if (oldKey.split("@")[0] === id && oldKey !== key) next.delete(oldKey);
								});
								next.set(key, foldSession(events));
								return next;
							});
						}).catch(function (err) {
							setError("读取会话历史失败：" + (err !== null && typeof err === "object" && typeof err.message === "string" ? err.message : String(err)));
						}).finally(function () {
							inflight.current.delete(key);
						});
					});
				});
			}, [open, expanded, forest, refreshTick]);

			// Folds resolved for render: keyed with the CURRENT cache key.
			var folds = React.useMemo(function () {
				var map = new Map();
				if (expanded === null) return map;
				forest.roots.forEach(function (root) {
					if (expanded.has(root.id) !== true) return;
					collectLineage(root.id, forest.childrenOf).forEach(function (id) {
						var fold = turnData.get(cacheKey(id));
						if (fold !== undefined) map.set(id, fold);
					});
				});
				return map;
			}, [expanded, forest, turnData, refreshTick]);

			// Center the current session's branch head in the panel viewport —
			// once per current-session change (user scrolls stay untouched).
			// Manual scrollTop math (not scrollIntoView): instant, and it never
			// scrolls any ancestor container of the panel body.
			var centeredRef = React.useRef(null);
			React.useEffect(function () {
				if (open !== true || currentId === undefined) return;
				if (centeredRef.current === currentId) return;
				var rootId = forest.rootOf.get(currentId);
				if (rootId === undefined) return;
				if (expanded === null || expanded.has(rootId) !== true) return;
				var body = bodyRef.current;
				if (body === null) return;
				var target = body.querySelector('[data-dst-session="' + currentId + '"]');
				if (target === null) return;
				centeredRef.current = currentId;
				var rect = target.getBoundingClientRect();
				var bodyRect = body.getBoundingClientRect();
				body.scrollTop = body.scrollTop + (rect.top - bodyRect.top) - (bodyRect.height - rect.height) / 2;
			}, [open, currentId, expanded, folds]);

			function onHoverRow(row, element) {
				if (dragRef.current !== null && dragRef.current.active === true) return;
				if (hoverTimer.current !== null) {
					clearTimeout(hoverTimer.current);
					hoverTimer.current = null;
				}
				if (row === null || element === null) {
					// Delayed hide: entering the tooltip or another row cancels it.
					// Flush positioning removes the uncovered gap strip, so this
					// timer only covers ordinary "left the tree" exits; 400ms is a
					// generous crossing window for the remaining paths.
					hoverTimer.current = setTimeout(function () {
						hoverTimer.current = null;
						setHover(null);
					}, 400);
					return;
				}
				var rect = element.getBoundingClientRect();
				hoverOpenedAt.current = Date.now();
				setHover({
					row: row,
					anchor: { x: rect.left + laneX(row.lane), y: rect.top }
				});
			}

			function onTipEnter() {
				if (hoverTimer.current !== null) {
					clearTimeout(hoverTimer.current);
					hoverTimer.current = null;
				}
			}

			function onTipLeave() {
				// Delayed, not instant: the pointer often passes THROUGH the
				// bubble to reach rows below it; an instant hide here would
				// flicker the tooltip away mid-transit before the next row's
				// enter re-anchors it. Same cancel paths as a row leave.
				onHoverRow(null, null);
			}

			// Any press outside the tooltip dismisses it, so a lingering bubble
			// can never eat a click meant for the panel. Presses INSIDE the
			// bubble keep it open (its text is scrollable, buttons clickable).
			// The 160ms grace window covers touch taps, whose mouseover +
			// mousedown arrive as one burst and would otherwise close the
			// tooltip the same instant it opened.
			React.useEffect(function () {
				if (hover === null) return;
				var handler = function (event) {
					if (Date.now() - hoverOpenedAt.current < 160) return;
					var target = event.target;
					if (target !== null && typeof target.closest === "function" && target.closest(".dsh-st-tip") !== null) return;
					if (hoverTimer.current !== null) {
						clearTimeout(hoverTimer.current);
						hoverTimer.current = null;
					}
					setHover(null);
				};
				document.addEventListener("mousedown", handler, true);
				return function () { document.removeEventListener("mousedown", handler, true); };
			}, [hover !== null]);

			// Two-step in-panel delete confirmation (no window.confirm: native
			// dialogs block the renderer and clash with the host's UI).
			var confirmState = React.useState(null);
			var confirmArchive = confirmState[0];
			var setConfirmArchive = confirmState[1];

			function doArchive(sessionId) {
				if (confirmArchive !== sessionId) {
					setConfirmArchive(sessionId);
					setHover(null);
					return;
				}
				if (busy !== null) return;
				// Resolve the return-to target BEFORE the archive call: once
				// the list push lands, the forest rebuilds without the
				// archived row and its parentId becomes unreachable. Only the
				// branch being STOOD ON navigates away — deleting a background
				// branch must never yank the view. open() lands on the
				// session's latest state, i.e. the trunk's newest node.
				var returnTo = currentId === sessionId
					? nearestPresentAncestor(sessionId, forest, list.byId)
					: undefined;
				setConfirmArchive(null);
				setBusy(sessionId);
				setError("");
				try {
					onArchiveAction(sessionId).then(function () {
						if (returnTo !== undefined) onOpenSession(returnTo);
					}).catch(function (err) {
						setError((err !== null && typeof err === "object" && typeof err.message === "string" ? err.message : String(err)));
					});
				} finally {
					setBusy(null);
				}
			}

			async function doFork(sessionId, cutSeq, isRewind) {
				if (busy !== null) return;
				setBusy(sessionId);
				setError("");
				setHover(null);
				try {
					// Rewind needs the source summary (title to inherit, running to
					// decide whether auto-archive is safe); plain fork ignores it.
					var summary = forest.summaryOf.get(sessionId);
					var meta = {
						title: summary !== undefined && typeof summary.title === "string" ? summary.title : "",
						running: summary !== undefined && summary.running === true
					};
					var out = await onForkAction(sessionId, cutSeq, isRewind, meta);
					onOpenSession(out.childId);
					// Non-fatal rewind steps (title rename / source archive) surface here.
					if (typeof out.warning === "string" && out.warning !== "") setError(out.warning);
				} catch (err) {
					setError((err !== null && typeof err === "object" && typeof err.message === "string" ? err.message : String(err)));
				} finally {
					setBusy(null);
				}
			}

			// Branch handoff: pending request (source + optional turn cut), then
			// a two-step in-panel confirmation like the archive flow.
			var handoffState = React.useState(null);
			var handoff = handoffState[0];
			var setHandoff = handoffState[1];
			// Handoff SOURCE pin: clicking a node (or its tooltip pin button)
			// arms it; dragging that node onto another lane, or the tooltip's
			// "handoff into this branch" on any OTHER branch, opens the confirm
			// bar with both ends set. Cleared on lineage change (stale across
			// trees), on the hint bar's button, and after a successful handoff.
			var pinnedState = React.useState(null);
			var pinnedSrc = pinnedState[0];
			var setPinnedSrc = pinnedState[1];
			React.useEffect(function () {
				setPinnedSrc(null);
				if (dragCleanup.current !== null) dragCleanup.current();
				dragRef.current = null;
				if (dragRaf.current !== 0) {
					cancelAnimationFrame(dragRaf.current);
					dragRaf.current = 0;
				}
				setDrag(null);
			}, [currentRootId]);

			function togglePinSource(row) {
				// Open turns have no endSeq — they are not a stable range bound.
				if (row.kind === "turn" && row.turn.endSeq === null) return;
				setPinnedSrc(function (prev) {
					var cut = row.kind === "head" ? null : row.turn.endSeq;
					var label = row.kind === "head" ? null : "第 " + row.turn.turn + " 轮";
					// Same-branch second click: the two nodes define an inclusive
					// range. Same node again still toggles off. Dropping the node
					// on a different branch (or the tooltip handoff button) is
					// the TARGET; a click on another branch retargets the source.
					if (prev !== null && prev.sessionId === row.sessionId) {
						var aCut = prev.fromEndSeq !== null ? prev.fromEndSeq : prev.uptoEndSeq;
						var aLabel = prev.fromEndSeq !== null ? prev.fromLabel : prev.turnLabel;
						if (prev.fromEndSeq === null && prev.uptoEndSeq === cut) return null;
						if (prev.fromEndSeq !== null && prev.fromEndSeq === cut && prev.uptoEndSeq === cut) return null;
						if (prev.fromEndSeq !== null && cut === prev.fromEndSeq) {
							// Drop this endpoint, keep the other as a single pin.
							return { sessionId: row.sessionId, fromEndSeq: null, uptoEndSeq: prev.uptoEndSeq, fromLabel: null, turnLabel: prev.turnLabel };
						}
						if (prev.fromEndSeq !== null && cut === prev.uptoEndSeq) {
							return { sessionId: row.sessionId, fromEndSeq: null, uptoEndSeq: prev.fromEndSeq, fromLabel: null, turnLabel: prev.fromLabel };
						}
						return makePinRange(row.sessionId, aCut, aLabel, cut, label);
					}
					return pinFromRow(row);
				});
				setHover(null);
			}

			function openHandoffConfirm(targetId, sourceOverride) {
				var src = sourceOverride !== undefined && sourceOverride !== null ? sourceOverride : pinnedSrc;
				if (busy !== null || src === null) return;
				if (src.sessionId === targetId) return; // same branch: use two-dot range instead
				setError("");
				setPinnedSrc(src);
				setHandoff({
					sourceId: src.sessionId,
					fromEndSeq: src.fromEndSeq,
					uptoEndSeq: src.uptoEndSeq,
					fromLabel: src.fromLabel,
					turnLabel: src.turnLabel,
					targetId: targetId
				});
				setHover(null);
			}

			function onNodePointerDown(row, event) {
				if (event.button !== 0) return;
				if (busy !== null || handoff !== null || confirmArchive !== null) return;
				if (row.kind === "turn" && row.turn.endSeq === null) return;
				event.stopPropagation();

				var source = (pinnedSrc !== null && pinnedSrc.sessionId === row.sessionId)
					? pinnedSrc
					: pinFromRow(row);
				var startX = event.clientX;
				var startY = event.clientY;
				var color = laneColor(row.lane, row.trunkLane);
				var sourceSeq = row.kind === "head" ? "h" : String(row.turn.startSeq);

				function readOrigin() {
					var body = bodyRef.current;
					if (body !== null) {
						var srcRow = body.querySelector('[data-dst-session="' + row.sessionId + '"][data-dst-seq="' + sourceSeq + '"]');
						var mark = srcRow !== null ? srcRow.querySelector(".dsh-st-dot, .dsh-st-headmark") : null;
						if (mark !== null) {
							var r = mark.getBoundingClientRect();
							return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
						}
					}
					return { x: startX, y: startY };
				}

				var origin = readOrigin();
				dragRef.current = {
					sessionId: source.sessionId,
					fromEndSeq: source.fromEndSeq,
					uptoEndSeq: source.uptoEndSeq,
					fromLabel: source.fromLabel,
					turnLabel: source.turnLabel,
					originX: origin.x,
					originY: origin.y,
					x: startX,
					y: startY,
					snapX: null,
					snapY: null,
					targetId: null,
					active: false,
					color: color
				};

				var finished = false;
				function cleanup() {
					if (finished === true) return;
					finished = true;
					window.removeEventListener("pointermove", onMove);
					window.removeEventListener("pointerup", onEnd);
					window.removeEventListener("pointercancel", onEnd);
					window.removeEventListener("keydown", onKey);
					dragCleanup.current = null;
				}
				dragCleanup.current = cleanup;

				function publish(next, immediate) {
					dragRef.current = next;
					if (immediate === true) {
						if (dragRaf.current !== 0) {
							cancelAnimationFrame(dragRaf.current);
							dragRaf.current = 0;
						}
						setDrag(next);
						return;
					}
					if (dragRaf.current === 0) {
						dragRaf.current = requestAnimationFrame(function () {
							dragRaf.current = 0;
							setDrag(dragRef.current);
						});
					}
				}

				function onMove(e) {
					var cur = dragRef.current;
					if (cur === null) return;
					var dx = e.clientX - startX;
					var dy = e.clientY - startY;
					if (cur.active !== true && dx * dx + dy * dy < DRAG_THRESHOLD_SQ) return;
					if (e.cancelable === true) e.preventDefault();
					var hit = hitDragTarget(e.clientX, e.clientY, source.sessionId);
					var orig = readOrigin();
					var next = {
						sessionId: source.sessionId,
						fromEndSeq: source.fromEndSeq,
						uptoEndSeq: source.uptoEndSeq,
						fromLabel: source.fromLabel,
						turnLabel: source.turnLabel,
						originX: orig.x,
						originY: orig.y,
						x: e.clientX,
						y: e.clientY,
						snapX: hit.snapX,
						snapY: hit.snapY,
						targetId: hit.targetId,
						active: true,
						color: color
					};
					var becameActive = cur.active !== true;
					if (becameActive === true) {
						setHover(null);
						setPinnedSrc(source);
						publish(next, true);
					} else {
						publish(next, false);
					}
				}

				function onEnd(e) {
					cleanup();
					var cur = dragRef.current;
					dragRef.current = null;
					if (dragRaf.current !== 0) {
						cancelAnimationFrame(dragRaf.current);
						dragRaf.current = 0;
					}
					setDrag(null);
					var cancelled = e !== undefined && e.type === "pointercancel";
					if (cur === null || cur.active !== true) {
						if (cancelled !== true) togglePinSource(row);
						return;
					}
					var swallow = function (ev) {
						ev.preventDefault();
						ev.stopPropagation();
					};
					document.addEventListener("click", swallow, true);
					setTimeout(function () { document.removeEventListener("click", swallow, true); }, 0);
					if (cancelled !== true && cur.targetId !== null && cur.targetId !== undefined) {
						openHandoffConfirm(cur.targetId, source);
					}
				}

				function onKey(e) {
					if (e.key !== "Escape") return;
					cleanup();
					dragRef.current = null;
					if (dragRaf.current !== 0) {
						cancelAnimationFrame(dragRaf.current);
						dragRaf.current = 0;
					}
					setDrag(null);
				}

				window.addEventListener("pointermove", onMove, { passive: false });
				window.addEventListener("pointerup", onEnd);
				window.addEventListener("pointercancel", onEnd);
				window.addEventListener("keydown", onKey);
			}

			async function doHandoffAction() {
				if (handoff === null || busy !== null) return;
				var sourceFold = folds.get(handoff.sourceId);
				var targetFold = folds.get(handoff.targetId);
				if (sourceFold === undefined || targetFold === undefined) {
					setError("移交需要源分支与目标分支的数据都已加载");
					return;
				}
				var delta = deltaTurnsOf(sourceFold, targetFold, handoff.uptoEndSeq, handoff.fromEndSeq);
				// Data may have refreshed between request and confirm (⟳ or a
				// list push); a now-empty delta must not ship a "0 轮" handoff
				// message — same guard as the live preview in the confirm bar.
				if (delta.length === 0) {
					setHandoff(null);
					setError("该分支相对目标分支没有可移交的差异轮次");
					return;
				}
				var label = sessionLabel(forest.summaryOf.get(handoff.sourceId), sourceFold);
				var text = buildHandoffText(label, delta, pinRangeCaption(handoff));
				var targetId = handoff.targetId;
				setHandoff(null);
				setBusy(handoff.sourceId);
				setError("");
				try {
					await onHandoffAction(targetId, text);
				setPinnedSrc(null); // consumed
				} catch (err) {
					setError((err !== null && typeof err === "object" && typeof err.message === "string" ? err.message : String(err)));
				} finally {
					setBusy(null);
				}
			}

			if (open !== true) return null;

			var dragActive = drag !== null && drag.active === true;
			var now = Date.now();
			var currentRoot = null;
			for (var ri = 0; ri < forest.roots.length; ri++) {
				if (forest.roots[ri].id === currentRootId) { currentRoot = forest.roots[ri]; break; }
			}
			var bodyContent;
			if (currentRoot === null) {
				bodyContent = el("div", { className: "dsh-st-empty", key: "empty" },
				TREE_ICON,
				el("div", { key: "t1" }, "打开一个会话"),
				el("div", { key: "t2" }, "这里显示它的完整分支谱系")
			);
			} else {
				bodyContent = el(RootSection, {
					key: currentRoot.id,
					root: currentRoot,
					forest: forest,
					folds: folds,
					currentId: currentId,
					expanded: expanded === null ? new Set() : expanded,
					onToggleExpand: function (id) {
						setExpanded(function (prev) {
							var base = prev === null ? new Set() : new Set(prev);
							if (base.has(id)) base.delete(id); else base.add(id);
							return base;
						});
					},
					onFork: doFork,
					onOpen: onOpenSession,
					onHover: onHoverRow,
					onArchive: doArchive,
					onNodePointerDown: onNodePointerDown,
					pinnedSession: pinnedSrc !== null ? pinnedSrc.sessionId : undefined,
					pinnedCut: pinnedSrc !== null ? pinnedSrc.uptoEndSeq : undefined,
					pinnedFrom: pinnedSrc !== null ? pinnedSrc.fromEndSeq : undefined,
					dragSourceId: dragActive === true ? drag.sessionId : undefined,
					dropTargetId: dragActive === true && drag.targetId !== null ? drag.targetId : undefined,
					busy: busy,
					now: now
				});
			}
			var branchTotal = currentRootId !== undefined ? collectLineage(currentRootId, forest.childrenOf).length - 1 : 0;

			// Handoff confirm-bar data: candidate targets (current lineage
			// minus the source) plus a live delta preview against the selected
			// target. -1 = one of the folds is still loading.
			var handoffCandidates = handoff !== null && currentRootId !== undefined
				? collectLineage(currentRootId, forest.childrenOf).filter(function (id) { return id !== handoff.sourceId; })
				: [];
			var handoffPreview = -1;
			if (handoff !== null) {
				var hfSource = folds.get(handoff.sourceId);
				var hfTarget = folds.get(handoff.targetId);
				if (hfSource !== undefined && hfTarget !== undefined) {
					handoffPreview = deltaTurnsOf(hfSource, hfTarget, handoff.uptoEndSeq, handoff.fromEndSeq).length;
				}
			}

			return el("div", { className: "dsh-st-panel" + (dragActive === true ? " dragging" : ""), "data-dsh-session-tree": "panel", ref: panelRef },
				el("div", { className: "dsh-st-head", key: "head" },
					el("span", { className: "dsh-st-title", key: "t" }, "会话树"),
					el("span", { className: "dsh-st-sub", key: "s" }, currentRoot === null ? "未打开会话" : branchTotal + " 个分支"),
					el("button", {
						className: "dsh-st-iconbtn", key: "r", title: "刷新分支数据",
						onClick: function () { setError(""); bumpRefresh(function (n) { return n + 1; }); }
					}, "⟳"),
					el("button", { className: "dsh-st-iconbtn", key: "x", title: "关闭", onClick: function () { setPanelOpen(false); } }, "✕")
				),
				error !== "" ? el("div", { className: "dsh-st-error", key: "err" }, error) : null,
				confirmArchive !== null ? el("div", { className: "dsh-st-confirm", key: "confirm" },
					el("span", { className: "dsh-st-confirm-text", key: "q" },
						"删除分支「" + sessionLabel(forest.summaryOf.get(confirmArchive), folds.get(confirmArchive)) + "」？（归档，日志保留）"),
					el("button", {
						className: "dsh-st-tipbtn danger", key: "yes", disabled: busy !== null,
						onClick: function () { doArchive(confirmArchive); }
					}, "确认删除"),
					el("button", {
						className: "dsh-st-tipbtn", key: "no",
						onClick: function () { setConfirmArchive(null); }
					}, "取消")
				) : null,
				pinnedSrc !== null && handoff === null && dragActive !== true ? el("div", { className: "dsh-st-pinbar", key: "pinbar" },
					el("span", { className: "dsh-st-pinbar-text", key: "t" },
						"移交源已选:「" + sessionLabel(forest.summaryOf.get(pinnedSrc.sessionId), folds.get(pinnedSrc.sessionId)) + "」（" + pinRangeCaption(pinnedSrc) + "）" +
						(pinnedSrc.fromEndSeq !== null
							? " · 拖到目标分支松开，或在目标节点上点「移交到此分支」"
							: " · 同分支再点另一节点划定区间，或拖到目标分支松开")),
					el("button", {
						className: "dsh-st-tipbtn", key: "clear",
						onClick: function () { setPinnedSrc(null); }
					}, "取消选源")
				) : null,
				handoff !== null ? el("div", { className: "dsh-st-confirm handoff", key: "handoff-confirm" },
					el("span", { className: "dsh-st-confirm-title", key: "q" },
						"移交「" + sessionLabel(forest.summaryOf.get(handoff.sourceId), folds.get(handoff.sourceId)) +
						"」（" + pinRangeCaption(handoff) + "）到："),
					el("select", {
						className: "dsh-st-confirm-select", key: "target",
						value: handoff.targetId,
						onChange: function (event) {
							var picked = event.target.value;
							setHandoff(function (prev) {
								return prev === null ? prev : { sourceId: prev.sourceId, fromEndSeq: prev.fromEndSeq, uptoEndSeq: prev.uptoEndSeq, fromLabel: prev.fromLabel, turnLabel: prev.turnLabel, targetId: picked };
							});
						}
					}, handoffCandidates.map(function (id) {
						var optLabel = sessionLabel(forest.summaryOf.get(id), folds.get(id));
						if (optLabel.length > 26) optLabel = optLabel.slice(0, 25) + "…";
						return el("option", { key: id, value: id }, optLabel + (id === currentId ? "（当前）" : ""));
					})),
					el("span", { className: "dsh-st-confirm-meta", key: "meta" },
						handoffPreview < 0 ? "数据加载中…" : handoffPreview === 0 ? "无差异轮次" : "共 " + handoffPreview + " 轮差异"),
					el("button", {
						className: "dsh-st-tipbtn", key: "yes", disabled: busy !== null || handoffPreview <= 0,
						onClick: function () { doHandoffAction(); }
					}, "确认移交"),
					el("button", {
						className: "dsh-st-tipbtn", key: "no",
						onClick: function () { setHandoff(null); }
					}, "取消")
				) : null,
				el("div", {
					className: "dsh-st-body", key: "body", ref: bodyRef,
					onScroll: function () { if (hover !== null) setHover(null); }
				}, bodyContent),
				hover !== null && dragActive !== true ? el(Tooltip, {
					key: "tip", row: hover.row, anchor: hover.anchor,
					busy: busy, onFork: doFork, onArchive: doArchive,
					onHandoffTarget: openHandoffConfirm, onPinSource: togglePinSource,
					pinnedSession: pinnedSrc !== null ? pinnedSrc.sessionId : undefined,
					pinnedLabel: pinnedSrc !== null ? sessionLabel(forest.summaryOf.get(pinnedSrc.sessionId), folds.get(pinnedSrc.sessionId)) : undefined,
					onTipEnter: onTipEnter, onTipLeave: onTipLeave
				}) : null,
				dragActive === true ? el(DragGhost, {
					key: "ghost",
					drag: drag,
					targetLabel: drag.targetId !== null && drag.targetId !== undefined
						? sessionLabel(forest.summaryOf.get(drag.targetId), folds.get(drag.targetId))
						: ""
				}) : null
			);
		}
		//#endregion

		//#region plugin body ---------------------------------------------------
		var inject = ["slots", "sessions", "connection"];

		function apply(ctx) {
			ensureStyles();

			// The wire API client handle, stable across connection generations
			// (the connection service re-resolves it internally).
			var connection = ctx.get("connection");
			var apiRef = { api: connection.api };

			var panelInjected = function () {
				return {
					apiRef: apiRef,
					// fork: cut AT a completed turn/end (keep-through). rewind: cut
					// BEFORE the turn (startSeq-1), keep the SAME title (no "(1)"
					// suffix — the rewound session must read as the same conversation)
					// and soft-archive the abandoned path so it leaves every list,
					// like Claude Code hiding the pre-rewind transcript. rename/
					// archive are non-fatal: the child opens regardless; failures
					// come back as a warning string.
					forkAt: async function (sessionId, cutSeq, isRewind, meta) {
						meta = meta !== null && typeof meta === "object" ? meta : {};
						var childId = await ctx.sessions.fork({
							sessionId: sessionId,
							atSeq: cutSeq,
							increaseTitle: isRewind !== true
						});
						var warning = "";
						if (isRewind === true) {
							if (typeof meta.title === "string" && meta.title !== "") {
								try {
									var ren = await apiRef.api.sessions.rename({ sessionId: childId, title: meta.title });
									if (ren.result.ok !== true) warning = "已撤回，但标题继承失败：" + ren.result.error.message;
								} catch (err) {
								warning = "已撤回，但标题继承失败：" + (err !== null && typeof err === "object" && typeof err.message === "string" ? err.message : String(err));
								}
							}
							// Skip the archive while the source still runs — hiding a
							// still-streaming agent from every list would be confusing.
							if (meta.running !== true) {
								try {
									var arch = await apiRef.api.workspace.archiveSession({ sessionId: sessionId });
									if (arch.result.ok !== true) warning = "已撤回，但旧分支归档失败：" + arch.result.error.message;
								} catch (err) {
								warning = "已撤回，但旧分支归档失败：" + (err !== null && typeof err === "object" && typeof err.message === "string" ? err.message : String(err));
								}
							}
						}
						return { childId: childId, warning: warning };
					},
					openSession: function (sessionId) {
						ctx.sessions.open(sessionId);
					},
					// Soft delete: hides the branch from every list, keeps the
					// session log (the stock UI can unarchive later).
					archiveBranch: async function (sessionId) {
						var response = await apiRef.api.workspace.archiveSession({ sessionId: sessionId });
						var result = response.result;
						if (result.ok !== true) {
							throw new Error("删除分支失败：" + result.error.message);
						}
					},
					// Branch handoff: deliver the delta transcript as ONE queued
					// user message — the target session's current model digests
					// it in-context and continues from there.
					handoffTo: async function (targetId, text) {
						var response = await apiRef.api.sessions.prompt({
							sessionId: targetId,
							mode: "queue",
							content: [{ type: "text", text: text }]
						});
						var result = response.result;
						if (result.ok !== true) {
							throw new Error("移交失败：" + result.error.message);
						}
					}
				};
			};

			ctx.slots.inject("shell.overlay", function () {
				ctx.slots.register({
					name: "shell.overlay",
					id: "dsh-session-tree-panel",
					order: 80,
					inject: panelInjected
				}, SafePanel);
			});

			ctx.slots.inject("sidebar.footer.action", function () {
				ctx.slots.register({
					name: "sidebar.footer.action",
					id: "dsh-session-tree-toggle",
					order: 15,
					inject: function () { return {}; }
				}, TreeToggle);
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
