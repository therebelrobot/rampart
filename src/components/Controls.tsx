import { useRef, useState } from "react";
import { hsbToHex } from "../color/convert";
import {
  type HarmonyScheme,
  type PaletteSettings,
  type StylePresetName,
  harmonyLabels,
  lightingPresets,
  settingLimits,
  stylePresets,
} from "../color/settings";
import { Icon, Section, Segmented, Slider, Toggle, hueGradient } from "./ui";

interface ControlsProps {
  settings: PaletteSettings;
  onChange: (patch: Partial<PaletteSettings>, coalesceKey?: string) => void;
  onSeedFromImage: (imageFile: File) => void;
  colorCount: number;
}

const percent = (value: number) => `${Math.round(value * 100)}`;

function activeStylePreset(settings: PaletteSettings): StylePresetName | null {
  for (const [presetName, preset] of Object.entries(stylePresets) as [StylePresetName, (typeof stylePresets)[StylePresetName]][]) {
    const matches = Object.entries(preset.settings).every(
      ([key, presetValue]) => Math.abs(Number(settings[key as keyof PaletteSettings]) - Number(presetValue)) < 1e-6,
    );
    if (matches) return presetName;
  }
  return null;
}

function activeLightingPreset(settings: PaletteSettings): string {
  return Object.entries(lightingPresets).find(
    ([, preset]) => preset.lightHue === settings.lightHue && preset.shadowHue === settings.shadowHue,
  )?.[0] ?? "custom";
}

export function Controls({ settings, onChange, onSeedFromImage, colorCount }: ControlsProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageStatus, setImageStatus] = useState<string | null>(null);
  const lightingPresetKey = activeLightingPreset(settings);
  const swatchFor = (hue: number) => hsbToHex({ hue, saturation: 0.75, brightness: 0.95 });

  return (
    <div className="controls">
      <Section title="Style" aside={<span className="section-aside">{colorCount} colors</span>}>
        <Segmented
          label="Preset"
          value={activeStylePreset(settings)}
          options={(Object.keys(stylePresets) as StylePresetName[]).map((presetName) => ({
            value: presetName,
            label: stylePresets[presetName].label,
            title: stylePresets[presetName].description,
          }))}
          onChange={(presetName) => onChange(stylePresets[presetName].settings)}
        />
        <p className="field-hint">
          Cartoony art uses bright, saturated colors with few tones. Realistic art uses desaturated colors with more tones, for a serious mood.
        </p>
      </Section>

      <Section title="Structure">
        <Slider label="Ramps" value={settings.rampCount} minimum={settingLimits.rampCount.minimum} maximum={settingLimits.rampCount.maximum} step={1}
          onChange={(rampCount) => onChange({ rampCount }, "rampCount")} />
        <Slider label="Shadow tones per ramp" value={settings.shadowStepCount} minimum={0} maximum={settingLimits.stepCount.maximum} step={1}
          onChange={(shadowStepCount) => onChange({ shadowStepCount }, "shadowStepCount")} />
        <Slider label="Light tones per ramp" value={settings.lightStepCount} minimum={0} maximum={settingLimits.stepCount.maximum} step={1}
          onChange={(lightStepCount) => onChange({ lightStepCount }, "lightStepCount")} />
        <Toggle label="Shared darkest shadow" checked={settings.includeSharedShadow}
          onChange={(includeSharedShadow) => onChange({ includeSharedShadow })}
          hint="A tinted near-black every ramp shares, used for outlines. It's a binding color that ties the palette together." />
        <Toggle label="Shared white highlight" checked={settings.includeSharedHighlight}
          onChange={(includeSharedHighlight) => onChange({ includeSharedHighlight })}
          hint="A tinted near-white for eyes, glints and specular highlights." />
        <Toggle label="Neutral ramp" checked={settings.includeNeutralRamp}
          onChange={(includeNeutralRamp) => onChange({ includeNeutralRamp })}
          hint="A low-saturation ramp for metal, stone and cloth." />
      </Section>

      <Section title="Base colors">
        <label className="field">
          <span className="field-row"><span className="field-label">Harmony</span></span>
          <select className="select" value={settings.harmony} onChange={(event) => onChange({ harmony: event.target.value as HarmonyScheme })}>
            {(Object.keys(harmonyLabels) as HarmonyScheme[]).map((scheme) => (
              <option key={scheme} value={scheme}>{harmonyLabels[scheme]}</option>
            ))}
          </select>
        </label>
        <p className="field-hint">Edit or lock a midtone and the unlocked ramps re-harmonize around it.</p>
        <Slider label="Saturation, low end" value={settings.baseSaturationMinimum} minimum={0} maximum={1} step={0.01} formatValue={percent}
          onChange={(baseSaturationMinimum) => onChange({ baseSaturationMinimum, baseSaturationMaximum: Math.max(baseSaturationMinimum, settings.baseSaturationMaximum) }, "satMin")} />
        <Slider label="Saturation, high end" value={settings.baseSaturationMaximum} minimum={0} maximum={1} step={0.01} formatValue={percent}
          onChange={(baseSaturationMaximum) => onChange({ baseSaturationMaximum, baseSaturationMinimum: Math.min(baseSaturationMaximum, settings.baseSaturationMinimum) }, "satMax")} />
        <Slider label="Midtone value, low end" value={settings.baseValueMinimum} minimum={0.3} maximum={0.85} step={0.01} formatValue={percent}
          onChange={(baseValueMinimum) => onChange({ baseValueMinimum, baseValueMaximum: Math.max(baseValueMinimum, settings.baseValueMaximum) }, "valMin")} />
        <Slider label="Midtone value, high end" value={settings.baseValueMaximum} minimum={0.3} maximum={0.85} step={0.01} formatValue={percent}
          onChange={(baseValueMaximum) => onChange({ baseValueMaximum, baseValueMinimum: Math.min(baseValueMaximum, settings.baseValueMinimum) }, "valMax")} />
        <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={(event) => {
          const imageFile = event.target.files?.[0];
          event.target.value = "";
          if (!imageFile) return;
          setImageStatus(`Reading ${imageFile.name}…`);
          onSeedFromImage(imageFile);
          setTimeout(() => setImageStatus(null), 1500);
        }} />
        <button type="button" className="button wide" onClick={() => imageInputRef.current?.click()}>
          <Icon name="image" /> Pull midtones from an image
        </button>
        {imageStatus && <p className="field-hint">{imageStatus}</p>}
      </Section>

      <Section title="Light & hue shifting">
        <label className="field">
          <span className="field-row"><span className="field-label">Light source</span></span>
          <select className="select" value={lightingPresetKey} onChange={(event) => {
            const preset = lightingPresets[event.target.value];
            if (preset) onChange({ lightHue: preset.lightHue, shadowHue: preset.shadowHue });
          }}>
            {Object.entries(lightingPresets).map(([presetKey, preset]) => (
              <option key={presetKey} value={presetKey}>{preset.label}</option>
            ))}
            <option value="custom" disabled>Custom</option>
          </select>
        </label>
        <p className="field-hint">
          {lightingPresets[lightingPresetKey]?.description ?? "Custom light and shadow hues."} Lights pick up the light source's color. Shadows pick up the ambient sky.
        </p>
        <div className="hue-pair">
          <span className="hue-chip" style={{ background: swatchFor(settings.lightHue) }} aria-hidden="true" />
          <Slider label="Lights lean toward" value={settings.lightHue} minimum={0} maximum={359} step={1} formatValue={(hue) => `${hue}°`}
            trackBackground={hueGradient} onChange={(lightHue) => onChange({ lightHue }, "lightHue")} />
        </div>
        <div className="hue-pair">
          <span className="hue-chip" style={{ background: swatchFor(settings.shadowHue) }} aria-hidden="true" />
          <Slider label="Shadows lean toward" value={settings.shadowHue} minimum={0} maximum={359} step={1} formatValue={(hue) => `${hue}°`}
            trackBackground={hueGradient} onChange={(shadowHue) => onChange({ shadowHue }, "shadowHue")} />
        </div>
        <Slider label="Hue shift per step" value={settings.hueShiftPerStep} minimum={0} maximum={40} step={1} formatValue={(degrees) => `${degrees}°`}
          hint="0 gives the lifeless, value-only ramp the book warns about. Pronounced shifts suit simple shapes. Subtle shifts suit busy textures like foliage."
          onChange={(hueShiftPerStep) => onChange({ hueShiftPerStep }, "hueShift")} />
        <Slider label="Saturation shift per step" value={settings.saturationShiftPerStep} minimum={0} maximum={0.25} step={0.01} formatValue={percent}
          hint="Lights lose this much saturation per step. Shadows gain it."
          onChange={(saturationShiftPerStep) => onChange({ saturationShiftPerStep }, "satShift")} />
      </Section>

      <Section title="Value">
        <Slider label="Value step between tones" value={settings.valueStep} minimum={0.05} maximum={0.22} step={0.005} formatValue={percent}
          hint="Bigger steps give more contrast. If values are too close, the colors blend."
          onChange={(valueStep) => onChange({ valueStep }, "valueStep")} />
        <Slider label="Warn when neighbours are closer than" value={settings.minimumValueContrast} minimum={0.02} maximum={0.12} step={0.005} formatValue={percent}
          onChange={(minimumValueContrast) => onChange({ minimumValueContrast }, "minContrast")} />
      </Section>

      <Section title="Color bridging">
        <Toggle label="Bridge similar colors" checked={settings.bridgingEnabled} onChange={(bridgingEnabled) => onChange({ bridgingEnabled })}
          hint="Colors from different ramps that look nearly the same get replaced with one in-between color. You end up with fewer colors, a more cohesive palette, and an easier time animating." />
        <Slider label="Bridging distance" value={settings.bridgingThreshold} minimum={0.01} maximum={0.12} step={0.005} formatValue={(distance) => distance.toFixed(3)}
          onChange={(bridgingThreshold) => onChange({ bridgingThreshold, bridgingEnabled: true }, "bridgeThreshold")} />
        <Toggle label="Keep midtones exact" checked={settings.bridgingProtectsMidtones} onChange={(bridgingProtectsMidtones) => onChange({ bridgingProtectsMidtones })} />
      </Section>
    </div>
  );
}
