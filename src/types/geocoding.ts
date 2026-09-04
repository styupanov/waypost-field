export type GeocodingResult = {
  id: string;
  label: string;
  lat: number;
  lon: number;
};

export type GeocodingResponse = {
  results: GeocodingResult[];
};
