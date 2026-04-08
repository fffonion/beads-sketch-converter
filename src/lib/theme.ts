export type ThemeMode = "light" | "dark" | "system";

export function getThemeClasses(isDark: boolean) {
  return isDark
    ? {
        page:
          "bg-[linear-gradient(180deg,rgba(94,69,45,0.12)_0,rgba(94,69,45,0.12)_1px,transparent_1px,transparent_22px),linear-gradient(90deg,rgba(94,69,45,0.08)_0,rgba(94,69,45,0.08)_1px,transparent_1px,transparent_22px),linear-gradient(180deg,#120e0b_0%,#19130f_32%,#211912_68%,#2a2018_100%)] text-stone-100",
        panel:
          "border-white/10 bg-[#15110d]/78 shadow-[0_24px_80px_rgba(0,0,0,0.4)]",
        hero: "bg-[#ead4b8] text-[#251910]",
        heroBadge: "text-[#7f5c34]",
        heroText: "text-[#4d3927]",
        card: "border-white/10 bg-[#1f1914] shadow-[0_10px_30px_rgba(0,0,0,0.2)]",
        cardTitle: "text-stone-100",
        cardMuted: "text-stone-400",
        tag: "bg-[#32281f] text-stone-300",
        dropzone:
          "border-stone-700 bg-[linear-gradient(180deg,#231b15_0%,#18120e_100%)] hover:border-stone-500 hover:bg-[#241d17]",
        segmented: "bg-[#2b2119]",
        segmentedTrigger:
          "text-stone-400 data-[state=active]:bg-[#f3dec0] data-[state=active]:text-[#24170f]",
        subtlePanel: "bg-[#18120d] text-stone-300",
        divider: "bg-stone-800",
        statusBar: (empty: boolean, busy: boolean) =>
          empty
            ? "bg-[#2c241d] text-stone-500"
            : busy
              ? "bg-[#f0dcc0] text-[#261a11]"
              : "bg-[#2a2119] text-stone-200",
        errorBox: "border-red-900 bg-red-950/50 text-red-200",
        primaryButton: "bg-[#f0dcc0] text-[#261a11] hover:bg-[#f7e6ce]",
        disabledButton: "pointer-events-none bg-stone-800 text-stone-500",
        pill: "border-white/10 bg-[#18120d]",
        emptyState: "border-stone-700 bg-[#1b1510] text-stone-400",
        controlShell: "border-white/10 bg-[#15110d]/88 shadow-[0_16px_36px_rgba(0,0,0,0.35)]",
        controlLabel: "text-stone-400",
        controlSegment: "bg-[#2b2119]",
        controlButtonActive: "bg-[#f3dec0] text-[#24170f]",
        controlButtonIdle: "text-stone-300",
        previewStage: "bg-[linear-gradient(180deg,#18120d_0%,#221a14_100%)]",
        stat: "border-white/10 bg-[#1f1914]",
        input: "border-stone-700 bg-[#18120d] text-stone-100 focus:border-stone-500",
        switchRoot: "bg-stone-700 data-[state=checked]:bg-[#f0dcc0]",
        switchThumb: "bg-white data-[state=checked]:translate-x-6",
        sliderTrack: "bg-[#3a2d24]",
        sliderRange: "bg-[#f0dcc0]",
        sliderThumb: "border-[#f0dcc0] bg-[#18120d]",
      }
    : {
        page:
          "bg-[linear-gradient(180deg,rgba(146,111,61,0.08)_0,rgba(146,111,61,0.08)_1px,transparent_1px,transparent_24px),linear-gradient(90deg,rgba(146,111,61,0.05)_0,rgba(146,111,61,0.05)_1px,transparent_1px,transparent_24px),linear-gradient(180deg,#f4ecd9_0%,#efe5d2_28%,#e6dbc7_64%,#ddd0ba_100%)] text-stone-900",
        panel:
          "border-black/10 bg-[#fffaf0]/90 shadow-[0_24px_80px_rgba(78,48,12,0.12)]",
        hero: "bg-[#1f1913] text-[#f8ecd9]",
        heroBadge: "text-[#d8c3a4]",
        heroText: "text-[#e6d8c3]",
        card: "border-stone-200 bg-white shadow-[0_10px_30px_rgba(69,43,18,0.06)]",
        cardTitle: "text-stone-800",
        cardMuted: "text-stone-500",
        tag: "bg-[#f4ead7] text-stone-700",
        dropzone:
          "border-stone-300 bg-[linear-gradient(180deg,#fffdf8_0%,#f7f0e2_100%)] hover:border-stone-500 hover:bg-[#fbf4e7]",
        segmented: "bg-[#f1e6d1]",
        segmentedTrigger:
          "text-stone-600 data-[state=active]:bg-[#201811] data-[state=active]:text-[#fff5e7]",
        subtlePanel: "bg-[#faf4e9] text-stone-600",
        divider: "bg-stone-200",
        statusBar: (empty: boolean, busy: boolean) =>
          empty
            ? "bg-stone-200 text-stone-500"
            : busy
              ? "bg-[#1f1913] text-[#fff4e5]"
              : "bg-[#efe4cf] text-stone-700",
        errorBox: "border-red-200 bg-red-50 text-red-700",
        primaryButton: "bg-[#1f1913] text-[#fff4e5] hover:bg-[#120d09]",
        disabledButton: "pointer-events-none bg-stone-300 text-stone-500",
        pill: "border-stone-200 bg-[#faf7f1]",
        emptyState: "border-stone-300 bg-white/75 text-stone-500",
        controlShell: "border-black/10 bg-[#fffaf0]/92 shadow-[0_16px_36px_rgba(78,48,12,0.12)]",
        controlLabel: "text-stone-500",
        controlSegment: "bg-[#f1e6d1]",
        controlButtonActive: "bg-[#201811] text-[#fff5e7]",
        controlButtonIdle: "text-stone-700",
        previewStage: "bg-[linear-gradient(180deg,#fbf5e8_0%,#efe7d8_100%)]",
        stat: "border-stone-200 bg-white",
        input: "border-stone-300 bg-white text-stone-900 focus:border-stone-500",
        switchRoot: "bg-stone-300 data-[state=checked]:bg-[#1f1913]",
        switchThumb: "bg-white data-[state=checked]:translate-x-6",
        sliderTrack: "bg-[#ebdfc9]",
        sliderRange: "bg-[#1f1913]",
        sliderThumb: "border-[#1f1913] bg-white",
      };
}

export type ThemeClasses = ReturnType<typeof getThemeClasses>;
