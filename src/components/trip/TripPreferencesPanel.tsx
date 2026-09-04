import styles from "./TripIntentPanel.module.css";
import type {
  DetourTolerance,
  InterestCategory,
  StopStyle,
  TripPreferences,
} from "@/types/preferences";

const CATEGORY_OPTIONS: { value: InterestCategory; label: string }[] = [
  { value: "nature_scenic", label: "Nature & Scenic" },
  { value: "outdoor_adventure", label: "Outdoor & Adventure" },
  { value: "history_landmarks", label: "History & Landmarks" },
  { value: "museums_culture", label: "Museums & Culture" },
  { value: "food_drink", label: "Food & Drink" },
  { value: "shopping", label: "Shopping" },
];

const DETOUR_OPTIONS: {
  value: DetourTolerance;
  label: string;
  summaryLabel: string;
}[] = [
  { value: "low", label: "Stay close to the route", summaryLabel: "Low detours" },
  { value: "balanced", label: "Balanced", summaryLabel: "Balanced detours" },
  { value: "high", label: "Worth a detour", summaryLabel: "High detours" },
];

const STOP_STYLE_OPTIONS: { value: StopStyle; label: string }[] = [
  { value: "quick", label: "Quick stops" },
  { value: "balanced", label: "Balanced" },
  { value: "longer", label: "Longer experiences" },
];

type TripPreferencesPanelProps = {
  preferences: TripPreferences;
  disabled: boolean;
  onPreferredCategoryChange: (category: InterestCategory, selected: boolean) => void;
  onExcludedCategoryChange: (category: InterestCategory, selected: boolean) => void;
  onDetourToleranceChange: (value: DetourTolerance) => void;
  onStopStyleChange: (value: StopStyle) => void;
};

function summaryFor(preferences: TripPreferences) {
  if (
    preferences.preferredCategories.length === 0 &&
    preferences.excludedCategories.length === 0 &&
    preferences.detourTolerance === "balanced" &&
    preferences.stopStyle === "balanced"
  ) return "Balanced trip";

  const preferredLabels = preferences.preferredCategories.map(
    (category) => CATEGORY_OPTIONS.find((option) => option.value === category)?.label
  );
  const detourLabel = DETOUR_OPTIONS.find(
    (option) => option.value === preferences.detourTolerance
  )?.summaryLabel;
  return [...preferredLabels, detourLabel].filter(Boolean).join(" · ");
}

export default function TripPreferencesPanel({
  preferences,
  disabled,
  onPreferredCategoryChange,
  onExcludedCategoryChange,
  onDetourToleranceChange,
  onStopStyleChange,
}: TripPreferencesPanelProps) {
  return (
    <details className={styles.preferences}>
      <summary>
        <span>Trip style</span>
        <span>{summaryFor(preferences)}</span>
      </summary>

      <div className={styles.preferenceQuestions}>
        <fieldset disabled={disabled}>
          <legend>What are you interested in?</legend>
          <div className={styles.choiceGrid}>
            {CATEGORY_OPTIONS.map((option) => (
              <label key={`preferred-${option.value}`}>
                <input
                  type="checkbox"
                  checked={preferences.preferredCategories.includes(option.value)}
                  onChange={(event) =>
                    onPreferredCategoryChange(option.value, event.target.checked)
                  }
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset disabled={disabled}>
          <legend>Anything you want to skip?</legend>
          <div className={styles.choiceGrid}>
            {CATEGORY_OPTIONS.map((option) => (
              <label key={`excluded-${option.value}`}>
                <input
                  type="checkbox"
                  checked={preferences.excludedCategories.includes(option.value)}
                  onChange={(event) =>
                    onExcludedCategoryChange(option.value, event.target.checked)
                  }
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset disabled={disabled}>
          <legend>How much of a detour is okay?</legend>
          <div className={styles.choiceGrid}>
            {DETOUR_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="detour-tolerance"
                  checked={preferences.detourTolerance === option.value}
                  onChange={() => onDetourToleranceChange(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset disabled={disabled}>
          <legend>What kind of stops do you prefer?</legend>
          <div className={styles.choiceGrid}>
            {STOP_STYLE_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="stop-style"
                  checked={preferences.stopStyle === option.value}
                  onChange={() => onStopStyleChange(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </details>
  );
}
