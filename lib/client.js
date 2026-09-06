window.__ModuleLoader__.load({
	id: "@dsh-extra/dsh-task-board",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var inject = ["slots"];
var COLUMNS = [
  { id: "\u5F85\u89C4\u5212", label: "\u5F85\u89C4\u5212" },
  { id: "\u5F85\u529E", label: "\u5F85\u529E" },
  { id: "\u8FDB\u884C\u4E2D", label: "\u8FDB\u884C\u4E2D" },
  { id: "\u5DF2\u5B8C\u6210", label: "\u5DF2\u5B8C\u6210" },
  { id: "\u5DF2\u5931\u8D25", label: "\u5DF2\u5931\u8D25" }
];
var LEVEL_OPTIONS = ["L0", "L1", "L2", "L3"];
var s = {
  wrap: { padding: "14px 20px 48px" },
  head: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 },
  h: { fontSize: 18, fontWeight: 700, margin: 0, color: "var(--dsw-alias-label-primary)" },
  badge: { fontSize: 12, fontWeight: 600, padding: "2px 10px", borderRadius: 999, background: "var(--dsw-alias-state-success-tertiary)", color: "var(--dsw-alias-state-success-primary)" },
  badgeDegraded: { fontSize: 12, fontWeight: 600, padding: "2px 10px", borderRadius: 999, background: "var(--dsw-alias-state-warn-tertiary)", color: "var(--dsw-alias-state-warn-primary)" },
  sub: { fontSize: 12.5, color: "var(--dsw-alias-label-tertiary)", margin: "0 0 12px", lineHeight: 1.6 },
  actionRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 14px", marginBottom: 12, background: "var(--dsw-alias-bg-layer-2)", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: 12 },
  btn: { padding: "7px 18px", border: "none", borderRadius: 8, background: "var(--dsw-alias-state-business-primary)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btn2: { padding: "6px 14px", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8, background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-secondary)", fontSize: 12.5, cursor: "pointer" },
  board: { display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 },
  col: { flex: "1 1 0", minWidth: 220, background: "var(--dsw-alias-bg-layer-2)", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: 12, display: "flex", flexDirection: "column" },
  colHead: { padding: "10px 12px", borderBottom: "1px solid var(--dsw-alias-border-l1)", display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 600, fontSize: 12.5, color: "var(--dsw-alias-label-primary)" },
  colCount: { background: "var(--dsw-alias-bg-layer-1)", borderRadius: 999, padding: "1px 8px", fontSize: 11.5, color: "var(--dsw-alias-label-secondary)" },
  colBody: { padding: 8, flex: 1, minHeight: 80 },
  card: { background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 10, padding: "10px 12px", marginBottom: 8, color: "var(--dsw-alias-label-primary)" },
  cardTitle: { fontWeight: 600, fontSize: 13.5, marginBottom: 4 },
  cardMeta: { color: "var(--dsw-alias-label-tertiary)", fontSize: 11.5, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 6 },
  cardDesc: { color: "var(--dsw-alias-label-secondary)", fontSize: 12.5, lineHeight: 1.55, maxHeight: 60, overflow: "hidden" },
  cardActions: { display: "flex", gap: 6, marginTop: 8 },
  levelOk: { background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-secondary)", padding: "1px 6px", borderRadius: 4, fontSize: 11 },
  levelWarn: { background: "var(--dsw-alias-state-warn-tertiary)", color: "var(--dsw-alias-state-warn-label)", padding: "1px 6px", borderRadius: 4, fontSize: 11 },
  levelErr: { background: "var(--dsw-alias-state-error-tertiary)", color: "var(--dsw-alias-state-error-primary)", padding: "1px 6px", borderRadius: 4, fontSize: 11 },
  empty: { padding: "24px 16px", textAlign: "center", color: "var(--dsw-alias-label-tertiary)", fontSize: 12.5, lineHeight: 1.6 },
  emptyBold: { color: "var(--dsw-alias-label-primary)" },
  modal: { position: "fixed", inset: 0, background: "rgba(20,22,26,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
  modalBox: { background: "var(--dsw-alias-bg-layer-1)", borderRadius: 14, padding: "20px 22px", maxWidth: 560, width: "90%", maxHeight: "90vh", overflow: "auto" },
  modalTitle: { fontSize: 16, fontWeight: 700, margin: "0 0 12px" },
  modalField: { marginBottom: 12 },
  modalFieldLabel: { display: "block", fontSize: 12, color: "var(--dsw-alias-label-secondary)", marginBottom: 4 },
  modalInput: { width: "100%", boxSizing: "border-box", padding: "6px 10px", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 6, fontSize: 13, background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)", fontFamily: "inherit" },
  modalHint: { background: "var(--dsw-alias-bg-layer-2)", padding: "8px 10px", borderRadius: 6, fontSize: 12, color: "var(--dsw-alias-label-secondary)", marginTop: 6, lineHeight: 1.55 },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }
};
function api(path, body) {
  const opts = { credentials: "include", headers: { Accept: "application/json" } };
  if (body !== void 0) {
    opts.method = "POST";
    opts.headers = { ...opts.headers, "Content-Type": "application/json" };
    opts.body = JSON.stringify(body);
  }
  return fetch(path, opts).then((r) => r.json());
}
function levelStyle(level) {
  if (level === "L2" || level === "L3") return s.levelErr;
  if (level === "L1") return s.levelWarn;
  return s.levelOk;
}
function BoardPage() {
  const [state, setState] = (0, import_react.useState)(null);
  const [showCreate, setShowCreate] = (0, import_react.useState)(false);
  const load = (0, import_react.useCallback)(async () => {
    const d = await api("/dsh-task-board/state");
    if (d.ok && d.state !== void 0) setState(d.state);
  }, []);
  (0, import_react.useEffect)(() => {
    void load();
  }, [load]);
  const action = (0, import_react.useCallback)(async (type, body) => {
    const d = await api("/dsh-task-board/action", { type, ...body });
    if (!d.ok) alert(d.error ?? "\u64CD\u4F5C\u5931\u8D25");
    await load();
    return d;
  }, [load]);
  if (state === null) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: s.wrap, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: s.sub, children: "\u52A0\u8F7D\u4EFB\u52A1\u770B\u677F\u4E2D\u2026" }) });
  }
  const tasks = state.tasks;
  const byCol = (col) => tasks.filter((t) => !t.archived && t.column === col);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.wrap, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.head, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { style: s.h, children: "\u4EFB\u52A1\u770B\u677F" }),
      state.governance?.mode === "\u672C\u5730" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "span",
        {
          style: s.badgeDegraded,
          title: "dsh-ledger \u672A\u5B89\u88C5\uFF1AL0/L1/L2 \u4EFB\u52A1\u964D\u7EA7\u8FD0\u884C\uFF08summary \u6807\u6CE8\u300C\u65E0\u8D26\u672C\u6CBB\u7406\u300D\uFF09\uFF0CL3 \u4E0D\u53EF\u9006\u52A8\u4F5C\u4E00\u5F8B\u62D2\u7EDD\u3002\u5B89\u88C5\u8D26\u672C\u540E\u6062\u590D\u5B8C\u6574 L0-L3 \u5BA1\u6279\u6CBB\u7406\u3002",
          children: "\u26A0 \u8D26\u672C\u672A\u5B89\u88C5 \xB7 \u672C\u5730\u964D\u7EA7\u6CBB\u7406"
        }
      ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: s.badge, children: "\u2713 \u6CBB\u7406\u5C31\u7EEA" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: s.sub, children: "\u4EFB\u52A1\u4E2D\u5FC3\u5316\u2014\u2014\u5E03\u7F6E \u2192 \u8D26\u672C\u88C1\u51B3 \u2192 \u5206\u8EAB\u6267\u884C \u2192 \u7ED3\u679C\u56DE\u586B\u3002\u6240\u6709\u4EFB\u52A1\u9ED8\u8BA4\u7531\u5168\u5DE5\u5177\u5206\u8EAB\u6267\u884C\uFF0C\u4E0D\u53EF\u9006\u52A8\u4F5C\u8FC7 dsh-ledger\u3002L2/L3 \u4EFB\u52A1\u521B\u5EFA\u65F6\u7ACB\u5373\u89E6\u53D1\u88C1\u51B3\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.actionRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: s.btn, onClick: () => setShowCreate(true), children: "+ \u65B0\u5EFA\u4EFB\u52A1" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: s.btn2, onClick: () => void load(), children: "\u5237\u65B0" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { marginLeft: "auto", color: "var(--dsw-alias-label-tertiary)", fontSize: 12 }, children: [
        "\u5171 ",
        tasks.filter((t) => !t.archived).length,
        " \u4E2A\u4EFB\u52A1"
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: s.board, children: COLUMNS.map((col) => {
      const list = byCol(col.id);
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.col, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.colHead, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: col.label }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: s.colCount, children: list.length })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: s.colBody, children: list.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: s.empty, children: "\u6682\u65E0\u4EFB\u52A1" }) : list.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.card, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: s.cardTitle, children: t.title }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.cardMeta, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: levelStyle(t.actionLevel), children: t.actionLevel }),
            t.cron !== void 0 && t.cron !== "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              "\u23F0 ",
              t.cron
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u4E00\u6B21\u6027" }),
            t.lastStatus !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              "\xB7 ",
              t.lastStatus
            ] }) : null
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: s.cardDesc, children: t.prompt }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.cardActions, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: s.btn2, onClick: () => void action("run", { id: t.id }).then((d) => {
              const run = d.run;
              if (run && (run.status === "\u5DF2\u963B\u65AD" || run.status === "\u5F85\u5BA1\u6279")) {
                window.alert(`${run.status}\uFF1A${run.summary ?? "\u8BE5\u4EFB\u52A1\u9700\u8981\u4E3B\u4EFB\u6279\u51C6\u540E\u624D\u4F1A\u6267\u884C\uFF08\u53EF\u5728\u4ECA\u65E5\u5F85\u529E\u6279\u51C6\uFF09"}`);
              }
            }), children: "\u25B6 \u6267\u884C" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: s.btn2, onClick: () => void action("archive", { id: t.id, task: { archived: true } }), children: "\u5F52\u6863" })
          ] })
        ] }, t.id)) })
      ] }, col.id);
    }) }),
    showCreate && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CreateModal, { onClose: () => setShowCreate(false), onCreated: () => {
      setShowCreate(false);
      void load();
    } })
  ] });
}
function CreateModal({ onClose, onCreated }) {
  const [title, setTitle] = (0, import_react.useState)("");
  const [prompt, setPrompt] = (0, import_react.useState)("");
  const [actionType, setActionType] = (0, import_react.useState)("\u6574\u7406\u6C47\u62A5");
  const [targetScope, setTargetScope] = (0, import_react.useState)("\u8BB0\u5FC6\u5E93");
  const [actionLevel, setActionLevel] = (0, import_react.useState)("L1");
  const [cron, setCron] = (0, import_react.useState)("");
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [err, setErr] = (0, import_react.useState)("");
  async function submit() {
    if (title.trim() === "" || prompt.trim() === "") {
      setErr("\u6807\u9898\u4E0E\u63D0\u793A\u8BCD\u5FC5\u586B");
      return;
    }
    setBusy(true);
    setErr("");
    const d = await api("/dsh-task-board/action", {
      type: "create",
      task: { title, prompt, actionType, targetScope, actionLevel, ...cron.trim() !== "" ? { cron } : {} }
    });
    setBusy(false);
    if (!d.ok) {
      setErr(d.error ?? "\u521B\u5EFA\u5931\u8D25");
      return;
    }
    onCreated();
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: s.modal, onClick: onClose, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.modalBox, onClick: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { style: s.modalTitle, children: "\u65B0\u5EFA\u4EFB\u52A1" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.modalField, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: s.modalFieldLabel, children: "\u4EFB\u52A1\u6807\u9898" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { style: s.modalInput, value: title, onChange: (e) => setTitle(e.target.value), placeholder: "\u4F8B\u5982\uFF1A\u6BCF\u5468\u6574\u7406\u8BB0\u5FC6\u5E93\u6458\u8981" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.modalField, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: s.modalFieldLabel, children: "\u4EFB\u52A1\u63D0\u793A\u8BCD\uFF08\u6295\u9012\u7ED9\u5206\u8EAB\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", { style: { ...s.modalInput, minHeight: 80, resize: "vertical" }, value: prompt, onChange: (e) => setPrompt(e.target.value), placeholder: "\u5177\u4F53\u6307\u4EE4" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.modalField, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: s.modalFieldLabel, children: "\u52A8\u4F5C\u7C7B\u578B\uFF08\u8D26\u672C\u88C1\u51B3\u8F93\u5165\uFF09" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { style: s.modalInput, value: actionType, onChange: (e) => setActionType(e.target.value) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.modalField, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: s.modalFieldLabel, children: "\u76EE\u6807\u8303\u56F4" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { style: s.modalInput, value: targetScope, onChange: (e) => setTargetScope(e.target.value) })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.modalField, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: s.modalFieldLabel, children: "\u52A8\u4F5C\u7EA7\u522B" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", { style: s.modalInput, value: actionLevel, onChange: (e) => setActionLevel(e.target.value), children: LEVEL_OPTIONS.map((l) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: l, children: l }, l)) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.modalField, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: s.modalFieldLabel, children: "cron\uFF08\u7559\u7A7A = \u4EC5\u624B\u52A8\uFF09" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { style: s.modalInput, value: cron, onChange: (e) => setCron(e.target.value), placeholder: "\u5206 \u65F6 \u65E5 \u6708 \u5468" })
      ] })
    ] }),
    (actionLevel === "L2" || actionLevel === "L3") && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: s.modalHint, children: "\u2139 L2/L3 \u4EFB\u52A1\u521B\u5EFA\u65F6\u7ACB\u5373\u89E6\u53D1\u8D26\u672C\u88C1\u51B3\uFF1A\u82E5\u963B\u65AD\u4F1A\u4EA7\u751F\u5BA1\u6279\u4EE4\u724C\uFF0C\u8FDB\u5165\u4ECA\u65E5\u5F85\u529E\u300C\u5F85\u6279\u5BA1\u6279\u300D\u3002\u8D26\u672C\u672A\u5B89\u88C5\u65F6\u6309\u672C\u5730\u964D\u7EA7\u7B56\u7565\u6267\u884C\u2014\u2014L2 \u653E\u884C\u5E76\u5C3D\u529B\u901A\u77E5\u4E3B\u4EFB\uFF0CL3 \u4E00\u5F8B\u62D2\u7EDD\u3002" }),
    err !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { ...s.modalHint, background: "var(--dsw-alias-state-error-tertiary)", color: "var(--dsw-alias-state-error-primary)" }, children: err }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.modalActions, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: s.btn2, onClick: onClose, disabled: busy, children: "\u53D6\u6D88" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: s.btn, onClick: () => void submit(), disabled: busy, children: busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u5230\u5F85\u529E" })
    ] })
  ] }) });
}
function apply(ctx) {
  ctx.slots.inject(
    "conversation.view",
    () => ctx.slots.register(
      { name: "conversation.view", id: "task-board", order: 22, label: () => "\u4EFB\u52A1\u770B\u677F" },
      BoardPage
    )
  );
}
		return module.exports;
	}
});
//# sourceMappingURL=client.js.map
