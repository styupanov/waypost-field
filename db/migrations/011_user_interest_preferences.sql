CREATE TABLE public.user_interest_preferences (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  weight DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  source TEXT NOT NULL DEFAULT 'explicit',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category),
  CONSTRAINT user_interest_preferences_category_check CHECK (
    category IN ('nature_scenic', 'outdoor_adventure', 'history_landmarks', 'museums_culture', 'food_drink', 'shopping')
  ),
  CONSTRAINT user_interest_preferences_weight_check CHECK (weight > 0 AND weight <= 1),
  CONSTRAINT user_interest_preferences_source_check CHECK (source = 'explicit')
);
