import { M as createVNode, P as defineComponent, T as createBlock, bt as withCtx, et as openBlock, ot as resolveComponent } from "./vue.runtime.esm-bundler-XtMkEjzB.js";
import "./_MapCache-CrDDrJ83.js";
import "./src-BsVsetYf.js";
import "./sanitize-html-DjneYy0u.js";
import "./users.store-yKax6vGx.js";
import "./MainSidebarHeader-CmJZs7dT.js";
import { t as BaseLayout_default } from "./BaseLayout-DRnUeQfL.js";
import "./constants-CtA9jyV-.js";
import "./merge-BLok1EPf.js";
import "./_baseOrderBy-B5lXBmMF.js";
import "./dateformat-Bc6vycUF.js";
import "./useDebounce-BLyJcepV.js";
import "./versions.store-g3lIYlHz.js";
import "./usePageRedirectionHelper-BH4J_qCO.js";
import "./useBugReporting-DbPg2k2j.js";
import "./canvas.utils-CaIgedg0.js";
import "./folders.store-Dx3ZI_kr.js";
import "./KeyboardShortcutTooltip-DBU_SpqH.js";
import "./sourceControl.eventBus-CxrpvwZH.js";
import "./useKeybindings-BhiF7QeB.js";
import "./useGlobalEntityCreation-DJLtho6X.js";
import "./useSettingsItems-DT8-mtcx.js";
import { t as AppSidebar_default } from "./AppSidebar-DSBwnAS-.js";
import "./readyToRun.store-AOiQETRV.js";
import "./resourceCenter.store-CXN3RNtD.js";
var DefaultLayout_default = /* @__PURE__ */ defineComponent({
	__name: "DefaultLayout",
	setup(__props) {
		return (_ctx, _cache) => {
			const _component_RouterView = resolveComponent("RouterView");
			return openBlock(), createBlock(BaseLayout_default, null, {
				sidebar: withCtx(() => [createVNode(AppSidebar_default)]),
				default: withCtx(() => [createVNode(_component_RouterView)]),
				_: 1
			});
		};
	}
});
export { DefaultLayout_default as default };
