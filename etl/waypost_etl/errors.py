class ValidationError(ValueError):
    """Invalid source data. Messages contain field paths, never payload values."""
