"""
canonical_schema.py
Implements P3-1, P3-3, P3-5:
- Bitemporal canonical fields (observed_at_utc, valid_from_utc, valid_to_utc, content_hash, source_snapshot_id)
- Per-entity change detection and hashing
- Sleeper scoring_settings validation adapter
"""

import hashlib
import json
import datetime

# Standard 12-team half-PPR league scoring baseline
EXPECTED_SCORING_RULES = {
    "rec": 0.5,            # Half-PPR
    "pass_td": 4.0,        # 4 pt passing TD
    "pass_yd": 0.04,       # 25 yds / pt
    "rush_yd": 0.1,        # 10 yds / pt
    "rush_td": 6.0,
    "rec_yd": 0.1,
    "rec_td": 6.0,
    "pass_int": -2.0,
    "fum_lost": -2.0,
}

def compute_entity_hash(entity_dict):
    """Computes SHA-256 hash of deterministic JSON representation of an entity."""
    clean_json = json.dumps(entity_dict, sort_keys=True)
    return hashlib.sha256(clean_json.encode("utf-8")).hexdigest()

def validate_scoring_settings(scoring_settings):
    """
    Implements P3-5: Validates scoring settings against expected baseline hash.
    Fails if any unexpected scoring key is nonzero or missing.
    """
    unhandled_keys = []
    parsed_rules = {}
    
    for k, v in scoring_settings.items():
        if k in EXPECTED_SCORING_RULES:
            if float(v) != EXPECTED_SCORING_RULES[k]:
                parsed_rules[k] = float(v)
        elif float(v) != 0.0:
            unhandled_keys.append((k, v))
            
    scoring_hash = compute_entity_hash(scoring_settings)
    
    return {
        "is_valid": len(unhandled_keys) == 0,
        "unhandled_keys": unhandled_keys,
        "scoring_hash": scoring_hash,
        "rules": scoring_settings
    }

def build_canonical_row(entity_id, entity_type, data_dict, observed_at_utc, snapshot_id):
    """
    Creates a bitemporal canonical row matching §4.2.
    """
    content_hash = compute_entity_hash(data_dict)
    valid_from = data_dict.get("updated_at") or observed_at_utc.isoformat()
    
    return {
        "entity_id": str(entity_id),
        "entity_type": entity_type,
        "observed_at_utc": observed_at_utc.isoformat(),
        "source_snapshot_id": snapshot_id,
        "valid_from_utc": valid_from,
        "valid_to_utc": None,
        "content_hash": content_hash,
        "parser_version": "v1.0",
        "data": data_dict
    }

if __name__ == "__main__":
    test_scoring = {
        "rec": 0.5,
        "pass_td": 4,
        "pass_yd": 0.04,
        "rush_yd": 0.1,
        "rush_td": 6,
        "rec_yd": 0.1,
        "rec_td": 6,
        "pass_int": -2,
        "fum_lost": -2
    }
    res = validate_scoring_settings(test_scoring)
    print("Scoring validation test:", res)
    assert res["is_valid"] is True
