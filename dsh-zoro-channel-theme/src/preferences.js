// Preference runtime adapted from dsh-joi-channel-theme 0.1.14 (MIT), © 2026 tpmoonchefryan.
const SKINS = ["santoryu", "enma", "native"];
const DEFAULT_SKIN = "santoryu", DEFAULT_SUIT = "santoryu", SUIT_FIELD = "suit";
const isSkin = value => SKINS.includes(value);
//#region src/client/suit.ts
/** 覆盖层标识。两套衣装共用同一个 source，保证任意时刻至多一层。 */
const LAYER = "dsh-zoro-channel-theme";
/**
* 历史 localStorage 键。旧版选择会在 Host 表单 ready 且可写时迁移到 ConfigForm；
* 此键仍作为兼容读取和 Host 表单不可用时的本地兜底。
*/
const LOCAL_KEY = "dsh-zoro-channel-theme.suit";
/**
* 衣装运行时：持有当前衣装、唯一的 token 层，以及偏好读写。
*/
var SuitRuntime = class {
	current = DEFAULT_SKIN;
	detach;
	listeners = /* @__PURE__ */ new Set();
	/** 用户是否已明确选过。未选过就不写盘——首装不该在设置文档里留痕。 */
	chosen = false;
	/** 本地选择尚未被 Host 接收时，挡住更早的默认值或用户快照。 */
	pendingLocalSuit;
	/** 宿主写入回包前按衣装去重。 */
	pendingHostWrites = /* @__PURE__ */ new Set();
	/** 同一 Host revision 对同一衣装只尝试一次；新快照可触发一次有界重试。 */
	lastHostWriteAttempt;
	stopWatchingScope;
	disposed = false;
	/** 关掉主题前那套衣装。再打开时回到它，而不是粗暴地回到默认。 */
	lastSuit = DEFAULT_SUIT;
	host;
	scope;
	/**
	* @param host - token 覆盖宿主（生产环境是 ctx.theme）。
	* @param scope - 本插件自有 ConfigForm；不可用时使用浏览器本地偏好。
	*/
	constructor(host, scope) {
this.host = host;
this.scope = scope;
	}
	/** @returns 当前皮肤（含 native）。 */
	get skin() {
return this.current;
	}
	/**
	* @returns 装饰层该用哪套衣装的素材。原生态下没有"当前衣装"可言，
	*          返回默认套只是给素材一个基准——原生态下装饰层本就不出图。
	*/
	get suit() {
return this.current === "native" ? DEFAULT_SUIT : this.current;
	}
	/** @returns 是否处于原生态（不着色、不装饰）。 */
	get isNative() {
return this.current === "native";
	}
	/**
	* 总开关。关 = 切到原生；开 = 回到关掉前那套衣装。
	* @param on - 是否让主题生效。
	*/
	setEnabled(on) {
this.setSuit(on ? this.lastSuit : "native");
	}
	/**
	* @returns 持久化通道的实况。`unavailable` / `memory` 表示这台机器上
	*          衣装偏好只在进程内有效——这是降级而不是故障，但必须能看见，
	*          否则「选了却没记住」会被当成随机 bug 反复排查。
	*/
	get persistence() {
const snap = this.scope?.getSnapshot();
return {
	channel: snap?.status === "ready" && snap.writable ? "host" : "local",
	hostStatus: snap?.status ?? "unbound",
	stored: this.read()
};
	}
	/**
	* 读回持久偏好：宿主原始用户层优先，其次旧 localStorage 键。
	* ConfigForm.value 已应用 schema 默认值，不能用它判断用户是否明确选择。
	* @returns 存着的衣装，没有则 undefined。
	*/
	read() {
const fromHost = this.explicitHostSuit();
if (fromHost !== void 0) return fromHost;
return this.readLegacy();
	}
	/**
	* ConfigForm.value 已应用 schema 默认值，只有原始 user 层的字段存在性
	* 能证明是宿主显式选择（即使值恰好等于默认值也一样）。
	*/
	explicitHostSuit() {
const snapshot = this.scope?.getSnapshot();
if (snapshot?.status !== "ready") return void 0;
const user = snapshot.user;
if (typeof user !== "object" || user === null || Array.isArray(user)) return void 0;
const suit = Reflect.get(user, SUIT_FIELD);
return isSkin(suit) ? suit : void 0;
	}
	/** @returns 旧版保存在 localStorage 中的合法衣装值。 */
	readLegacy() {
try {
	const local = globalThis.localStorage?.getItem(LOCAL_KEY);
	if (isSkin(local)) return local;
} catch {}
	}
	/**
	* 读回持久偏好并挂上对应衣装；无宿主/旧值时用默认衣装。
	*/
	start() {
this.disposed = false;
const stored = this.read();
if (stored !== void 0) {
	this.current = stored;
	this.chosen = true;
	if (stored !== "native") this.lastSuit = stored;
}
this.mount();
this.stopWatchingScope?.();
this.stopWatchingScope = this.scope?.subscribe(() => this.syncFromHost());
this.syncFromHost();
	}
	/**
	* 合并一次宿主快照，不把 schema 默认值当成用户选择。
	* 宿主表单可写时，把旧 localStorage 偏好迁移到新表单。
	*/
	syncFromHost() {
if (this.disposed) return;
if ((this.scope?.getSnapshot())?.status !== "ready") return;
const explicit = this.explicitHostSuit();
if (this.pendingLocalSuit !== void 0) {
	if (explicit === this.pendingLocalSuit) {
this.pendingLocalSuit = void 0;
return;
	}
	this.writeHost(this.pendingLocalSuit);
	return;
}
if (explicit !== void 0) {
	if (explicit !== this.current) this.setSuit(explicit, false);
	return;
}
const legacy = this.readLegacy();
if (legacy !== void 0) {
	if (legacy !== this.current) this.setSuit(legacy, false);
	this.writeHost(legacy);
}
	}
	/**
	* 换一套衣装。相同值的内部回读不重挂或通知；用户明确选择仍会持久化。
	* @param suit - 目标衣装。
	* @param persist - 是否写回设置文档；来自设置文档的回读要传 false。
	*/
	setSuit(suit, persist = true) {
if (persist) {
	this.chosen = true;
	this.pendingLocalSuit = this.explicitHostSuit() === suit ? void 0 : suit;
	this.lastHostWriteAttempt = void 0;
}
if (suit === this.current && (this.chosen || !persist)) {
	if (persist) this.write(suit);
	return;
}
if (this.current !== "native") this.lastSuit = this.current;
this.current = suit;
this.mount();
if (persist) this.write(suit);
for (const listener of this.listeners) listener(suit);
	}
	/**
	* 订阅衣装变化。
	* @param listener - 变化后调用。
	* @returns 取消订阅的 disposer。
	*/
	subscribe(listener) {
this.listeners.add(listener);
return () => {
	this.listeners.delete(listener);
};
	}
	/** 卸载 token 层并清空订阅。disposer 幂等（HMR 下会被重复调用）。 */
	dispose() {
this.disposed = true;
this.stopWatchingScope?.();
this.stopWatchingScope = void 0;
this.detach?.();
this.detach = void 0;
this.listeners.clear();
	}
	/**
	* 卸掉旧层再挂新层。原生态只卸不挂。
	*
	* 只卸就够了：overrideTokens 的 disposer 精确回收它自己那一层，
	* 而内置 light/dark 的 tokens 是空对象，层没了就落回 app 原生取值。
	*/
	mount() {
this.detach?.();
this.detach = void 0;
if (this.current === "native") return;
this.detach = this.host.overrideTokens(LAYER, tokensFor(this.current));
	}
	writeHost(suit) {
const snapshot = this.scope?.getSnapshot();
if (!this.scope || snapshot?.status !== "ready" || !snapshot.writable || this.pendingHostWrites.has(suit)) return;
if (this.explicitHostSuit() === suit) return;
if (this.lastHostWriteAttempt?.suit === suit && this.lastHostWriteAttempt.revision === snapshot.revision) return;
this.lastHostWriteAttempt = {
	suit,
	revision: snapshot.revision
};
this.pendingHostWrites.add(suit);
this.scope.set(SUIT_FIELD, suit).catch(() => {}).finally(() => {
	this.pendingHostWrites.delete(suit);
	this.syncFromHost();
});
	}
	write(suit) {
this.writeHost(suit);
try {
	globalThis.localStorage?.setItem(LOCAL_KEY, suit);
} catch {}
	}
};
//#endregion

export { SuitRuntime, SKINS };
