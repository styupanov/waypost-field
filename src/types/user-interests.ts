import type { InterestCategory } from "./preferences.ts";

export type UserInterestPreference = {
  category: InterestCategory;
  weight: number;
  source: "explicit";
};

export type UserInterestProfile = {
  interests: UserInterestPreference[];
};

export type UserInterestProfileResponse = {
  selectedCategories: InterestCategory[];
};
