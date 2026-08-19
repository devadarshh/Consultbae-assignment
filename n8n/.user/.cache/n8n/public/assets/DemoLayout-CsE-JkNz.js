import { C as computed, E as createCommentVNode, M as createVNode, P as defineComponent, T as createBlock, bt as withCtx, et as openBlock, nt as provide, ot as resolveComponent } from "./vue.runtime.esm-bundler-XtMkEjzB.js";
import "./_MapCache-CrDDrJ83.js";
import { bi as useRoute } from "./src-BsVsetYf.js";
import "./sanitize-html-DjneYy0u.js";
import { s as useWorkflowsStore } from "./users.store-yKax6vGx.js";
import { t as BaseLayout_default } from "./BaseLayout-DRnUeQfL.js";
import { Cc as WorkflowIdKey } from "./constants-CtA9jyV-.js";
import "./merge-BLok1EPf.js";
import "./_baseOrderBy-B5lXBmMF.js";
import "./dateformat-Bc6vycUF.js";
import "./useDebounce-BLyJcepV.js";
import "./useClipboard-rTh7fBbC.js";
import "./executions.store-R46IFWXG.js";
import "./assistant.store-TwZ65rq9.js";
import "./chatPanel.store-CcuXf0qx.js";
import "./RunData-DMUZd8Zb.js";
import "./NDVEmptyState-BuTIQOIa.js";
import "./useEnvFeatureFlag-B0D8Rjp-.js";
import "./externalSecrets.ee.store-DnuD9dq-.js";
import "./uniqBy-iMocF-tq.js";
import "./usePinnedData-6cs4oFEc.js";
import "./nodeIcon-Cc0Lmu9p.js";
import "./canvas.utils-CaIgedg0.js";
import "./nodeCreator.store-DRjAjMk5.js";
import "./useCanvasOperations-CtjMC9Vr.js";
import "./folders.store-Dx3ZI_kr.js";
import "./RunDataHtml-Dprg2oeh.js";
import "./NodeIcon-Be4Kw4K9.js";
import "./useRunWorkflow-BIyMxaO6.js";
import "./pushConnection.store-BnaeQ6o0.js";
import "./vue-json-pretty-BB5lIPuK.js";
import "./collaboration.store-Bo5I5Jlb.js";
import "./dateFormatter-CQs9Cspw.js";
import "./useExecutionHelpers-1Ho_Fh7s.js";
import "./KeyboardShortcutTooltip-DBU_SpqH.js";
import "./useKeybindings-BhiF7QeB.js";
import "./useLogsTreeExpand-Bl2BCqRN.js";
import { t as LogsPanel_default } from "./LogsPanel-C7GLPDJj.js";
import "./AnimatedSpinner-DnSOf2rO.js";
import "./useResizablePanel-CQjZF6zc.js";
var DemoFooter_default = /* @__PURE__ */ defineComponent({
	__name: "DemoFooter",
	setup(__props) {
		const workflowsStore = useWorkflowsStore();
		const hasExecutionData = computed(() => workflowsStore.workflowExecutionData);
		return (_ctx, _cache) => {
			return hasExecutionData.value ? (openBlock(), createBlock(LogsPanel_default, {
				key: 0,
				"is-read-only": true
			})) : createCommentVNode("", true);
		};
	}
});
var DemoLayout_default = /* @__PURE__ */ defineComponent({
	__name: "DemoLayout",
	setup(__props) {
		const route = useRoute();
		provide(WorkflowIdKey, computed(() => {
			const name = route.params.name;
			return Array.isArray(name) ? name[0] : name;
		}));
		return (_ctx, _cache) => {
			const _component_RouterView = resolveComponent("RouterView");
			return openBlock(), createBlock(BaseLayout_default, null, {
				footer: withCtx(() => [createVNode(DemoFooter_default)]),
				default: withCtx(() => [createVNode(_component_RouterView)]),
				_: 1
			});
		};
	}
});
export { DemoLayout_default as default };
