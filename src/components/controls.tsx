import * as Label from "@radix-ui/react-label";
import * as Slider from "@radix-ui/react-slider";
import * as Switch from "@radix-ui/react-switch";
import clsx from "clsx";
import { ChevronDown, LaptopMinimal, Languages, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import type { Locale } from "../lib/i18n";
import { getThemeClasses, type ThemeMode } from "../lib/theme";

export function ThemeSwitch({
  themeLabel,
  themeMode,
  setThemeMode,
  isDark,
}: {
  themeLabel: string;
  themeMode: ThemeMode;
  setThemeMode: (themeMode: ThemeMode) => void;
  isDark: boolean;
}) {
  const theme = getThemeClasses(isDark);

  return (
    <div
      aria-label={themeLabel}
      className={clsx("flex h-11 items-center gap-1 rounded-[10px] border px-1.5 py-1 backdrop-blur", theme.controlShell)}
      title={themeLabel}
    >
      <div className={clsx("grid grid-cols-3 rounded-[8px] p-0.5", theme.controlSegment)}>
        {([
          ["light", Sun],
          ["dark", Moon],
          ["system", LaptopMinimal],
        ] as const).map(([value, Icon]) => (
          <button
            key={value}
            className={clsx(
              "flex h-7 w-7 items-center justify-center rounded-[6px] transition",
              themeMode === value ? theme.controlButtonActive : theme.controlButtonIdle,
            )}
            onClick={() => setThemeMode(value)}
            aria-label={value}
            title={value}
            type="button"
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function LanguageSwitch({
  languageLabel,
  chineseLabel,
  englishLabel,
  locale,
  setLocale,
  isDark,
}: {
  languageLabel: string;
  chineseLabel: string;
  englishLabel: string;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  isDark: boolean;
}) {
  const theme = getThemeClasses(isDark);

  return (
    <div
      aria-label={languageLabel}
      className={clsx("flex h-11 items-center gap-1 rounded-[10px] border px-1.5 py-1 backdrop-blur", theme.controlShell)}
      title={languageLabel}
    >
      <Languages className={clsx("h-3.5 w-3.5 shrink-0", theme.controlLabel)} />
      <div className={clsx("grid grid-cols-2 rounded-[8px] p-0.5", theme.controlSegment)}>
        <button
          className={clsx(
            "min-w-[38px] rounded-[6px] px-1.5 py-1 text-xs font-semibold transition",
            locale === "zh-CN" ? theme.controlButtonActive : theme.controlButtonIdle,
          )}
          onClick={() => setLocale("zh-CN")}
          type="button"
        >
          <span className="sm:hidden">中</span>
          <span className="hidden sm:inline">{chineseLabel}</span>
        </button>
        <button
          className={clsx(
            "min-w-[38px] rounded-[6px] px-1.5 py-1 text-xs font-semibold transition",
            locale === "en-US" ? theme.controlButtonActive : theme.controlButtonIdle,
          )}
          onClick={() => setLocale("en-US")}
          type="button"
        >
          <span className="sm:hidden">En</span>
          <span className="hidden sm:inline">{englishLabel}</span>
        </button>
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  isDark,
}: {
  label: string;
  value: string;
  isDark: boolean;
}) {
  const theme = getThemeClasses(isDark);
  return (
    <div
      className={clsx(
        "flex items-center justify-between gap-3 rounded-[10px] border px-3 py-2.5 transition-colors sm:rounded-[12px] sm:px-4",
        theme.stat,
      )}
    >
      <p className={clsx("text-xs uppercase tracking-[0.18em]", theme.cardMuted)}>{label}</p>
      <p className={clsx("text-sm font-semibold", theme.cardTitle)}>{value}</p>
    </div>
  );
}

export function NumberField({
  id,
  label,
  value,
  onChange,
  isDark,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  isDark: boolean;
}) {
  const theme = getThemeClasses(isDark);
  return (
    <div className="space-y-2">
      <Label.Root className={clsx("text-xs font-semibold uppercase tracking-[0.14em]", theme.cardMuted)} htmlFor={id}>
        {label}
      </Label.Root>
      <input
        id={id}
        className={clsx("w-full rounded-md border px-3 py-2.5 text-sm outline-none transition sm:rounded-lg sm:px-4 sm:py-3", theme.input)}
        inputMode="numeric"
        min={1}
        pattern="[0-9]*"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function NumberSliderField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  isDark,
  mobileSliderOnly = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  step?: number;
  isDark: boolean;
  mobileSliderOnly?: boolean;
}) {
  const theme = getThemeClasses(isDark);
  const parsed = Number.parseInt(value, 10);
  const sliderValue = Number.isFinite(parsed)
    ? Math.max(min, Math.min(max, parsed))
    : min;

  return (
    <div className="space-y-3">
      {mobileSliderOnly ? (
        <>
          <div className="flex items-center justify-between gap-3 sm:hidden">
            <Label.Root className={clsx("text-xs font-semibold uppercase tracking-[0.14em]", theme.cardMuted)} htmlFor={`${id}-slider`}>
              {label}
            </Label.Root>
            <span className={clsx("text-sm font-semibold", theme.cardTitle)}>{sliderValue}</span>
          </div>
          <div className="hidden sm:block">
            <NumberField
              id={id}
              label={label}
              value={value}
              onChange={onChange}
              isDark={isDark}
            />
          </div>
        </>
      ) : (
        <NumberField
          id={id}
          label={label}
          value={value}
          onChange={onChange}
          isDark={isDark}
        />
      )}
      <Slider.Root
        id={`${id}-slider`}
        className="relative flex h-5 touch-none select-none items-center"
        max={max}
        min={min}
        step={step}
        value={[sliderValue]}
        onValueChange={(next) => onChange(String(next[0] ?? sliderValue))}
      >
        <Slider.Track className={clsx("relative h-2 grow rounded-full", theme.sliderTrack)}>
          <Slider.Range className={clsx("absolute h-full rounded-full", theme.sliderRange)} />
        </Slider.Track>
        <Slider.Thumb className={clsx("block h-5 w-5 rounded-full border shadow outline-none", theme.sliderThumb)} />
      </Slider.Root>
    </div>
  );
}

export function SwitchRow({
  id,
  title,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  isDark,
}: {
  id: string;
  title: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  isDark: boolean;
}) {
  const theme = getThemeClasses(isDark);
  return (
    <div className={clsx("flex items-start justify-between gap-4", disabled && "opacity-55")}>
      <div className="min-w-0 flex-1">
        <Label.Root className={clsx("text-sm font-semibold", theme.cardTitle)} htmlFor={id}>
          {title}
        </Label.Root>
        {description ? (
          <p className={clsx("mt-1 text-xs leading-5", theme.cardMuted)}>{description}</p>
        ) : null}
      </div>
      <Switch.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className={clsx("relative h-7 w-12 shrink-0 rounded-full outline-none transition", theme.switchRoot)}
      >
        <Switch.Thumb className={clsx("block h-5 w-5 translate-x-1 rounded-full shadow transition", theme.switchThumb)} />
      </Switch.Root>
    </div>
  );
}

export function SliderRow({
  id,
  label,
  value,
  min,
  max,
  step,
  disabled,
  onValueChange,
  isDark,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onValueChange: (value: number) => void;
  isDark: boolean;
}) {
  const theme = getThemeClasses(isDark);
  return (
    <div className={clsx("space-y-3", disabled && "opacity-45")}>
      <div className="flex items-center justify-between gap-3">
        <Label.Root className={clsx("text-xs font-semibold uppercase tracking-[0.14em]", theme.cardMuted)} htmlFor={id}>
          {label}
        </Label.Root>
        <span className={clsx("text-sm font-semibold", theme.cardTitle)}>{value}</span>
      </div>
      <Slider.Root
        id={id}
        className="relative flex h-5 touch-none select-none items-center"
        disabled={disabled}
        max={max}
        min={min}
        step={step}
        value={[value]}
        onValueChange={(next) => onValueChange(next[0] ?? value)}
      >
        <Slider.Track className={clsx("relative h-2 grow rounded-full", theme.sliderTrack)}>
          <Slider.Range className={clsx("absolute h-full rounded-full", theme.sliderRange)} />
        </Slider.Track>
        <Slider.Thumb className={clsx("block h-5 w-5 rounded-full border shadow outline-none", theme.sliderThumb)} />
      </Slider.Root>
    </div>
  );
}

export function CollapsibleSection({
  title,
  subtitle,
  collapsed,
  onToggle,
  isDark,
  children,
}: {
  title: string;
  subtitle?: string;
  collapsed: boolean;
  onToggle: () => void;
  isDark: boolean;
  children: ReactNode;
}) {
  const theme = getThemeClasses(isDark);

  return (
    <section
      className={clsx(
        "rounded-[10px] border p-4 transition-colors sm:rounded-[12px] xl:rounded-[14px]",
        theme.card,
      )}
    >
      <button
        className="flex w-full items-start justify-between gap-3 text-left"
        onClick={onToggle}
        type="button"
      >
        <div className="min-w-0">
          <p className={clsx("text-sm font-semibold", theme.cardTitle)}>{title}</p>
          {subtitle ? <p className={clsx("mt-1 text-xs", theme.cardMuted)}>{subtitle}</p> : null}
        </div>
        <span
          className={clsx(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition",
            theme.pill,
          )}
        >
          <ChevronDown
            aria-hidden="true"
            className={clsx("h-4 w-4 transition-transform", collapsed ? "-rotate-90" : "rotate-0")}
          />
        </span>
      </button>
      {!collapsed ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}


