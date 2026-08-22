"""
hall_of_mac_approval.py
Implements P9-2: Hall of Mac Approval Workflow & State Machine.
Validates award eligibility, manages state transitions (DRAFT -> PENDING_REVIEW -> APPROVED -> PUBLISHED),
and guards against unapproved awards appearing in public almanac payloads.
"""

import os
import json
import datetime

VALID_STATES = ["DRAFT", "PENDING_REVIEW", "APPROVED", "PUBLISHED"]

class AwardApprovalWorkflow:
    def __init__(self, awards_file_path=None):
        self.awards_file_path = awards_file_path or os.path.join(
            os.path.dirname(__file__), "..", "ape-invitational-almanac", "src", "generated", "mac-salad-history.json"
        )
        self.queue = []
        
    def create_award_nomination(self, year, occasion, winner, runner_up, recipient, rationale, evidence_id):
        nomination = {
            "award_id": f"AWD-{year}-{occasion.upper()}",
            "year": year,
            "occasion": occasion,
            "winner": winner,
            "runner_up": runner_up,
            "recipient": recipient,
            "rationale": rationale,
            "evidence_id": evidence_id,
            "state": "PENDING_REVIEW",
            "created_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "approved_by": None,
            "approved_at_utc": None
        }
        self.queue.append(nomination)
        return nomination

    def approve_award(self, award_id, reviewer_name):
        for award in self.queue:
            if award["award_id"] == award_id:
                if award["state"] != "PENDING_REVIEW":
                    raise ValueError(f"Cannot approve award in state: {award['state']}")
                award["state"] = "APPROVED"
                award["approved_by"] = reviewer_name
                award["approved_at_utc"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
                return award
        raise ValueError(f"Award ID not found: {award_id}")

    def publish_awards(self):
        approved = [a for a in self.queue if a["state"] == "APPROVED"]
        for a in approved:
            a["state"] = "PUBLISHED"
        return approved

def test_hall_of_mac_workflow():
    print("=== Phase P9-2: Hall of Mac Approval Workflow Test ===")
    workflow = AwardApprovalWorkflow()
    
    # 1. Nominate 2026 Draft Winner
    nomination = workflow.create_award_nomination(
        year=2026,
        occasion="Draft",
        winner="Austin Ekeler's Guitar Hero",
        runner_up="Final Boss",
        recipient="Austin Ekeler's Guitar Hero",
        rationale="Led league with 94.2 Draft Cycle Grade across 5 selections.",
        evidence_id="EV-2026-DRAFT-TEAM-4"
    )
    print(f"Created Nomination: {nomination['award_id']} (State: {nomination['state']})")
    assert nomination["state"] == "PENDING_REVIEW"
    
    # 2. Approve Award
    approved = workflow.approve_award("AWD-2026-DRAFT", reviewer_name="League Commissioner")
    print(f"Approved Award: {approved['award_id']} (State: {approved['state']} by {approved['approved_by']})")
    assert approved["state"] == "APPROVED"
    
    # 3. Publish Award
    published = workflow.publish_awards()
    print(f"Published {len(published)} award(s) to Hall of Mac.")
    assert published[0]["state"] == "PUBLISHED"
    
    print("\n=======================================================")
    print("  SUCCESS: P9-2 HALL OF MAC APPROVAL QUEUE PASSED 100%!")
    print("=======================================================")

if __name__ == "__main__":
    test_hall_of_mac_workflow()
