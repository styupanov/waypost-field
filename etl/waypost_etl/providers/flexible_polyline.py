"""Port of src/lib/routing/here-normalization.ts, with WGS84 range checks."""

from ..errors import ValidationError

ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"


def decode_flexible_polyline(encoded: str) -> list[list[float]]:
    if not isinstance(encoded, str) or not encoded:
        raise ValidationError("polyline must be a nonempty string")
    cursor = 0

    def unsigned():
        nonlocal cursor
        result = shift = 0
        while cursor < len(encoded):
            value = ALPHABET.find(encoded[cursor])
            cursor += 1
            if value < 0:
                raise ValidationError("invalid flexible polyline character")
            result += (value & 0x1F) * 2**shift
            if not value & 0x20:
                return result
            shift += 5
            if shift > 50:
                raise ValidationError("flexible polyline value is too large")
        raise ValidationError("truncated flexible polyline")

    def signed():
        value = unsigned()
        return -(value // 2) - 1 if value & 1 else value // 2

    if unsigned() != 1:
        raise ValidationError("unsupported flexible polyline version")
    header = unsigned()
    factor = 10 ** (header & 15)
    third_dimension = (header >> 4) & 7
    latitude = longitude = 0
    coordinates = []
    while cursor < len(encoded):
        latitude += signed()
        longitude += signed()
        if third_dimension:
            # Match the application's 2D output: consume but omit third ordinates.
            signed()
        point = [longitude / factor, latitude / factor]
        if not (-180 <= point[0] <= 180 and -90 <= point[1] <= 90):
            raise ValidationError("polyline coordinate is outside WGS84 bounds")
        coordinates.append(point)
    return coordinates


def concatenate_section_coordinates(sections: list[list[list[float]]]) -> list[list[float]]:
    """Match TS: remove consecutive duplicates, including shared section endpoints."""
    coordinates = []
    for section in sections:
        for point in section:
            if not coordinates or coordinates[-1] != point:
                coordinates.append(point)
    return coordinates
