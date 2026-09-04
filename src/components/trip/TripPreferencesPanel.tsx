import styles from "./TripIntentPanel.module.css";
import type {
  DetourTolerance,
  InterestCategory,
  StopStyle,
  TripPreferences,
  DrivingPace,
} from "@/types/preferences";
import { calculateTripDayRecommendation } from "@/lib/trip/multi-day";

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
  baselineDurationSeconds?: number;
  onDrivingPaceChange: (value: DrivingPace) => void;
  onTripDaysChange: (days: number) => void;
};

function summaryFor(preferences: TripPreferences) {
  if (
    preferences.preferredCategories.length === 0 &&
    preferences.excludedCategories.length === 0 &&
    preferences.detourTolerance === "balanced" &&
    preferences.stopStyle === "balanced" &&
    preferences.drivingPace === "balanced" &&
    !preferences.tripDaysOverridden
  ) return "Balanced trip";

  const preferredLabels = preferences.preferredCategories.map(
    (category) => CATEGORY_OPTIONS.find((option) => option.value === category)?.label
  );
  const detourLabel = DETOUR_OPTIONS.find(
    (option) => option.value === preferences.detourTolerance
  )?.summaryLabel;
  const paceLabel = preferences.drivingPace === "easy" ? "Easy pace" : preferences.drivingPace === "road_trip" ? "Road trip pace" : null;
  const daysLabel = preferences.tripDaysOverridden && preferences.selectedTripDays ? `${preferences.selectedTripDays} days` : null;
  return [...preferredLabels, detourLabel, paceLabel, daysLabel].filter(Boolean).join(" · ");
}

export default function TripPreferencesPanel({
  preferences,
  disabled,
  onPreferredCategoryChange,
  onExcludedCategoryChange,
  onDetourToleranceChange,
  onStopStyleChange,
  baselineDurationSeconds,
  onDrivingPaceChange,
  onTripDaysChange,
}: TripPreferencesPanelProps) {
  const multiDay = baselineDurationSeconds === undefined ? null : calculateTripDayRecommendation(baselineDurationSeconds, preferences);
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

        {multiDay?.isMultiDay ? <section className={styles.multiDay}>
          <h4>Multi-day trip</h4>
          <p>≈ {Math.round(multiDay.baselineDrivingHours)} h driving</p>
          <p><strong>Suggested</strong> {multiDay.recommendedDays} days · {Math.max(0, multiDay.recommendedDays - 1)} nights</p>
          <fieldset disabled={disabled}><legend>Trip length</legend><div className={styles.dayChoices}>{multiDay.dayOptions.map((days) => <label key={days}><input type="radio" name="trip-days" checked={multiDay.selectedDays === days} onChange={() => onTripDaysChange(days)} />{days} days{days === multiDay.recommendedDays ? " · Recommended" : ""}</label>)}</div></fieldset>
          <fieldset disabled={disabled}><legend>Driving pace</legend><div className={styles.paceChoices}>{([
            ["easy", "Easy", "More exploring, shorter driving days"],
            ["balanced", "Balanced", "Driving + exploring"],
            ["road_trip", "Road trip", "Long driving days are OK"],
          ] as const).map(([value, label, description]) => <label key={value}><input type="radio" name="driving-pace" checked={preferences.drivingPace === value} onChange={() => onDrivingPaceChange(value as DrivingPace)} /><span><strong>{label}</strong><small>{description}</small></span></label>)}</div></fieldset>
        </section> : null}
      </div>
    </details>
  );
}
