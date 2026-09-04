export type Coordinates = {
  lat: number;
  lon: number;
};

export type TripEndpointSource = "text" | "map";

export type TripEndpoint = {
  input: string;
  coordinates: Coordinates | null;
  source: TripEndpointSource;
};

export type TripField = "origin" | "destination";
export type PickingMode = TripField | null;
