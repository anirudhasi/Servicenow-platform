#!/usr/bin/env python3
"""
ServiceNow Incident Data Generator
Produces data in the EXACT format of the real ServiceNow export seen in screenshots:
- Date format: DD-MM-YYYY HH:MM
- Priority: "4 - Standard", "3 - Moderate", "2 - High", "1 - Critical"
- Urgency: "3 - Low", "2 - Medium", "1 - High"
- Real group names from actual SLB data
- 1200+ rows spanning 6 months (Nov 2025 - Apr 2026)
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import random, os

random.seed(42)
np.random.seed(42)

START = datetime(2025, 11, 1)
END   = datetime(2026, 4, 30, 23, 59)

PRIORITY_LABELS = {1:"1 - Critical", 2:"2 - High", 3:"3 - Moderate", 4:"4 - Standard"}
URGENCY_LABELS  = {1:"1 - High",     2:"2 - Medium",  3:"3 - Low"}

# ── Real assignment group → first_assignment_group pools (from live SLB data) ──

ASSIGNMENT_GROUPS  = ["DPS-WEB-L2", "Global-Traceability-L2", "CG-DPS-Automation-L2"]
ASSIGNMENT_WEIGHTS = [0.55, 0.30, 0.15]

FIRST_GROUP_POOLS = {
    "DPS-WEB-L2": [
        "A&I-ITSYS-DPM-L2",
        "A2R-APMCare-EQRP-L2",
        "A2R-APMCare-NG-DFHSE-L2",
        "A2R-APMCare-Workforce-L2",
        "A2R-MT-Ecosystem-L2",
        "ACCH-eClaims-Processing-L2",
        "Ariba AB-GB-L2",
        "Ariba-Sourcing-L2",
        "Badge-L3",
        "Barir-L2",
        "Barir-L3",
        "CAM-Finance Support",
        "CAM-Manufacturing Support",
        "CDSS Digital Service Desk",
        "CG-A2R-APMCare-NG-Sustain-L2",
        "CUS-L2",
        "D2D-P2P-L2",
        "DC-BRZ-SUS-L2",
        "DIG-ChangePoint-L2",
        "DIG-SoftwareLib-L2",
        "DIS-L2",
        "DO-ChampionX-Hypercare",
        "DPS-Automation-L2",
        "DPS-DC-LAM&MCA-L2",
        "DPS-Web-Hypercare",
        "DPS-WEB-L2",
        "DPS-WH-L2",
        "EMC-Application Monitoring",
        "EMC-SIMS-L1",
        "ESM-CoE-L2",
        "GBS-Digital-Finance-L2",
        "GBS-Digital-Supply-L2",
        "GBS-Digital-Support-L2",
        "Global Onsite Support",
        "Global Service Desk",
        "Global Service Desk-CAM Champions",
        "H2R Payroll EH-L2",
        "INF-Digital Signage",
        "ITINF-Enterprise Digital Workplace-L2",
        "KLHUB-eClaims-Processing-L2",
        "LAM-eClaims-Processing-L2",
        "M2C-Customer_Delivery_System_incident",
        "M2C-Field Delivery Platform-L2",
        "MFG-L2",
        "Mobility Infra Services-L3",
        "OSS-SAP Logistics",
        "OTM-L2",
        "P&P-Master Data Support-L3",
        "P&P-STP-L2",
        "PACS-L2",
        "PDS-Ariba",
        "PDS-GTS",
        "Problem Management Process Team",
        "PSD-L2",
        "QMR-L2",
        "R2I-Competency-L2",
        "R2I-QHSE-L2",
        "R2R ACCOUNTS PAYABLE L2",
        "R2R IDT TAN L2",
        "R2R InterCo L2",
        "R2R-eClaimsMD-L2",
        "R2R-eFinance-L2",
        "R2R-Legacy-L2",
        "R2R-Treasury-L2",
        "S&C-CUSTOMER CONTRACT REPORTS",
        "SAP-R2R-CONCUR-L2",
        "Security-L2",
        "Segment-BSSA-COL-Support-L2",
        "STP-L2",
    ],
    "Global-Traceability-L2": [
        "A2R-FMP Support-L2",
        "Basis-L2",
        "Basis-L3",
        "CAM-Finance Support",
        "CAM-Supply Chain Support",
        "D2D-MMLegacy-L2",
        "D2D-P2P-L2",
        "DIS-L2",
        "DIS-WM-L2",
        "DPS-WEB-L2",
        "EAM-L2",
        "EMC-Application Monitoring",
        "ESM-IT-DEVOPS",
        "Global Onsite Support",
        "Global Service Desk",
        "Global-Traceability-L2",
        "M2C-Field Delivery Platform-L2",
        "MFG-L2",
        "OSS-SAP Ariba",
        "OTM-L2",
        "P&P-Supply Chain Support-L2",
        "P&SC-MRP-L2",
        "PDS-DIS",
        "PSD-L2",
        "Security-CAM-L2",
        "Security-L2",
        "STP-L2",
        "Tech-MFG-L2",
    ],
    "CG-DPS-Automation-L2": [
        "A&I-ITSYS-IAM-L2",
        "CG-DPS-Automation-L2",
        "DPS-Automation-L2",
        "DPS-WEB-L2",
        "GBS-Digital-Finance-L2",
        "Global Service Desk",
        "R2R-eClaimsMD-L2",
        "Security-L2",
    ],
}

def pick_first_group(assignment_group: str) -> str:
    pool = FIRST_GROUP_POOLS[assignment_group]
    weights = []
    for g in pool:
        if g == assignment_group:
            weights.append(6)   # direct assignment most common
        elif g in ("Global Service Desk", "Global Onsite Support"):
            weights.append(3)   # help-desk routing
        else:
            weights.append(1)
    return random.choices(pool, weights=weights)[0]


SERVICE_OFFERINGS = {
    "DPS-WEB-L2": [
        "Approve Buddy Web App.", "ePermit", "ApproveBuddy Web App.",
        "GBS CI Tracker.", "DPS - Training Booking Portal (TEP)",
        "Access Now", "Sharepoint- CAF RDS", "EMM DEP",
        "iWorkPlace.", "eClaimsMobile.", "SLBRide",
    ],
    "Global-Traceability-L2": [
        "Global Traceability", "BlueWorld", "BlueMM - IM (ITE)",
        "BlueMM - WM (ITE)", "GT Mobile", "Adhoc Reservation portal",
    ],
    "CG-DPS-Automation-L2": [
        "Generic Technical Service Offering", "Materials Management - MCT-E",
        "iWorkPlace.", "eClaimsMobile.",
    ],
}

ASSIGNEES = {
    "DPS-WEB-L2": [
        "Saurabh Saraswat (SSaraswat2@slb.com)",
        "Atharva Shrinivas Adam (AAdam20@slb.com)",
        "Shivam Kumar Rajput (SRajput6@slb.com)",
        "Vinay Pal (VPal7@slb.com)",
        "Swet Bhushan (SBhushan2@slb.com)",
    ],
    "Global-Traceability-L2": [
        "Vinay Pal (VPal7@slb.com)",
        "Godavari Bai M R (GR51@slb.com)",
        "Kris Cruickshank (KCruickshank@slb.com)",
    ],
    "CG-DPS-Automation-L2": [
        "Vishu Gupta (VGupta24@slb.com)",
        "Murugan Mani (MMani5@slb.com)",
        "Swet Bhushan (SBhushan2@slb.com)",
    ],
}

IMPACTED_USERS = [
    "Paul McLean (PMclean@slb.com)", "Musah Yusufu (MYusufu@slb.com)",
    "Neiby Eliana Rodriguez (NRodriguez29@slb.com)", "Les Craigue (LCraigue@slb.com)",
    "Djamal Soilihi (DSoilihi@slb.com)", "Colin St Croix (CStcroix@slb.com)",
    "Kris Cruickshank (KCruickshank@slb.com)", "Aly Abdelzaher (AAbdelzaher2@slb.com)",
    "Vishu Gupta (VGupta24@slb.com)", "Yurii Zelenko (YZelenko@slb.com)",
    "Younes Atif (YAtif@slb.com)", "Kotchaphan Tosu (PTosu@slb.com)",
    "Gareth Gough (GGough@slb.com)", "Saurabh Saraswat (SSaraswat2@slb.com)",
    "Adaline Rexy Mary (RMary@slb.com)", "Ryan Shim (RShim@slb.com)",
    "Sufyan Eshtiwi (SEshtiwi@slb.com)", "Amy Rios (ARios16@slb.com)",
    "Claire Findlay (CFindlay2@slb.com)", "Magdalena Stoica (MStoica5@slb.com)",
    "Mihir Gandhi (MGandhi@slb.com)", "Murugan Mani (MMani5@slb.com)",
    "Sarah Johnson (SJohnson@slb.com)", "Priya Sharma (PSharma@slb.com)",
    "Marcus Webb (MWebb@slb.com)", "James Okafor (JOkafor@slb.com)",
    "Elena Rodriguez (ERodriguez@slb.com)", "Ravi Patel (RPatel@slb.com)",
    "Carlos Mendez (CMendez@slb.com)", "Lin Wei (LWei@slb.com)",
]

SHORT_DESCRIPTIONS = {
    "DPS-WEB-L2": [
        "Approvebuddy Web App is giving an error",
        "ApproveBuddy Certification Issue",
        "Access permissions for the ePTW Global platform.",
        "MCT SP Access - DPS-WEB-L2 - Top Priority",
        "GBS CI Tracker - Access control rules/logic clarification",
        "DPS - Training Booking Portal (TEP) - Unable to access",
        "Sharepoint CAF-RDS access request",
        "EMM DEP - Device enrollment issue",
        "iWorkPlace - Issue with desk booking permissions",
        "SLB Ride - Information missing from booking",
        "Badge registration not working",
        "ePermit access required for field operations",
        "Approve Buddy Web App - login error after password reset",
        "TEP Communication Event Details PBI",
        "GBS CI Tracker - User role configuration required",
        "Access Now - New user provisioning",
        "eClaimsMobile - Unable to submit expense claim",
    ],
    "Global-Traceability-L2": [
        "GT- Blueworld - access issue",
        "GT Mobile update issue - new blue MM version not working",
        "GT- GT Stores - Panida Tosu ()",
        "KSAHR Letter generation Data fetch bot not running as expected",
        "Adhoc Reservation portal - Cannot submit reservation",
        "BlueMM IM - copy paste functionality not working",
        "Global Traceability - user access provisioning",
        "GT Mobile - App not loading after update",
        "BlueMM WM - Inventory sync issue",
        "BlueWorld - access request for new team member",
        "BlueMM WM - Mobile application not syncing",
    ],
    "CG-DPS-Automation-L2": [
        "Materials Management - MCT-E access request",
        "Generic Technical Service - automation script failure",
        "NIS Auto-Bot - Process failed with errors",
        "iWorkPlace - automation not triggering",
        "Automation pipeline - data processing error",
        "MCT SP Access required for materials team",
        "CG automation service - scheduled job failure",
    ],
}

STATES        = ["On Hold", "Resolved", "In Progress", "Closed", "Open"]
STATE_WEIGHTS = [0.15, 0.55, 0.15, 0.10, 0.05]

ON_HOLD_REASONS = [
    "Awaiting Impacted User", "Awaiting Change", "Awaiting Third Party",
    "Pending Approval", "Awaiting Information",
]

RESOLUTION_CODES = [
    "Solution Provided", "User Training & Documentation Provided",
    "Change/Enhancement Requested", "No Fix Needed", "User Not Available",
    "Workaround Provided", "Closed/Resolved by User",
]

RESOLUTION_NOTES_TEMPLATES = [
    "Root cause:\nAccess was not provisioned after the latest system upgrade.\n\nResolution steps:\n- Identified the missing role assignment\n- Provisioned the required access for the user\n- User confirmed successful access via chat",
    "Root cause:\nCertification not completed before access was requested.\n\nResolution steps:\n- User advised to complete the My PCP Certification\n- Allow 24 hours for system sync after completion\n- Ticket will be closed once confirmation is received",
    "Root cause:\nApplication cache conflict after recent update.\n\nResolution steps:\n- Cleared application cache and cookies\n- Reinstalled the application\n- User confirmed issue resolved",
    "Root cause:\nChange/Enhancement requested by business - not a defect.\n\nResolution steps:\n- Enhancement request logged as per SLB ESM process\n- Ticket closed accordingly",
    "Root cause:\nUser configuration issue - incorrect settings applied.\n\nResolution steps:\n- Reset user configuration to default\n- Applied correct policy settings\n- Verified with user that issue is resolved",
    "Root cause:\nThird-party system unavailability caused the integration failure.\n\nResolution steps:\n- Escalated to third-party vendor\n- Monitored restoration\n- Confirmed service restored and data re-synced",
    "Solution Provided - User guided through the process and issue resolved.\n\nResolution steps:\n- Walked user through the correct steps\n- User confirmed resolution via follow-up chat",
    "Root cause:\nPermission misconfiguration after role change.\n\nResolution steps:\n- Reviewed current role assignments\n- Updated permissions in the system\n- User confirmed access restored",
]

TAGS_LIST = [
    "", "", "", "Multiple Reassignment", "Awaiting Change",
    "Reopened -Asking for additional changes", "Change Request",
    "Reopened - Different assignment queue", "Reopen - Incorrectly reopen by end user",
]


def fmt_dt(dt):
    if dt is None or pd.isna(dt):
        return ""
    return dt.strftime("%d-%m-%Y %H:%M")


def rand_dt(start, end):
    delta = int((end - start).total_seconds())
    dt = start + timedelta(seconds=random.randint(0, delta))
    if dt.hour < 7 or dt.hour > 20:
        dt = dt.replace(hour=random.randint(8, 18))
    if dt.weekday() >= 5:
        dt += timedelta(days=(7 - dt.weekday()))
    return dt


def daily_volume(dt):
    base = 7
    if dt.weekday() == 0: base += 3
    if dt.weekday() == 4: base -= 2
    if dt.day >= 28 or dt.day <= 2: base += 3
    if dt.weekday() == 1 and 8 <= dt.day <= 14: base += 2
    return max(3, base + random.randint(-2, 3))


def generate(n_records=1200):
    records = []
    inc_base = 447638
    cur = START

    while cur <= END and len(records) < n_records:
        n = daily_volume(cur)
        for _ in range(n):
            if len(records) >= n_records:
                break

            inc_base += random.randint(1, 3)

            assignment_group = random.choices(ASSIGNMENT_GROUPS, weights=ASSIGNMENT_WEIGHTS)[0]
            first_group      = pick_first_group(assignment_group)

            priority = random.choices([1, 2, 3, 4], weights=[2, 10, 28, 60])[0]
            urgency  = {1: 1, 2: random.choice([1, 2]), 3: random.choice([2, 3]), 4: 3}[priority]

            created_at = rand_dt(cur, cur + timedelta(hours=23, minutes=59))

            mttr_h = {
                1: random.uniform(0.5, 6),
                2: random.uniform(4, 36),
                3: random.uniform(12, 96),
                4: random.uniform(24, 240),
            }[priority]

            age_days = (END - created_at).days
            if age_days < 1 and priority >= 3:
                state = "Open"
            else:
                state = random.choices(STATES, weights=STATE_WEIGHTS)[0]

            resolved_at = None
            business_dur = None
            resolution_code = None
            res_note = None
            hold_reason = ""

            if state in ["Resolved", "Closed"]:
                resolved_at = created_at + timedelta(hours=mttr_h)
                if resolved_at > END + timedelta(days=15):
                    resolved_at = END + timedelta(hours=random.uniform(1, 72))
                business_dur = int(mttr_h * 3600 * 0.4)
                resolution_code = random.choice(RESOLUTION_CODES)
                res_note = random.choice(RESOLUTION_NOTES_TEMPLATES)
            elif state == "On Hold":
                hold_reason = random.choice(ON_HOLD_REASONS)

            sla_due_h = {1: 4, 2: 8, 3: 24, 4: 72}[priority]
            sla_due = created_at + timedelta(hours=sla_due_h)
            made_sla = True
            if resolved_at:
                made_sla = resolved_at <= sla_due
            elif state in ["Open", "In Progress", "On Hold"]:
                made_sla = datetime.now() <= sla_due if sla_due > datetime.now() else random.random() > 0.3

            reass_w = [60, 25, 10, 4, 1] if priority >= 3 else [40, 30, 20, 8, 2]
            reassignment_count = random.choices([0, 1, 2, 3, 4], weights=reass_w)[0]
            reopen_count = random.choices([0, 1, 2], weights=[90, 8, 2])[0]

            updated_at = resolved_at if resolved_at else (
                created_at + timedelta(hours=random.uniform(0.5, min(max(age_days, 1) * 24, 120))))
            updated_by = random.choice(ASSIGNEES[assignment_group])
            if "(" in updated_by:
                updated_by = updated_by.split("(")[1].rstrip(")")

            last_assign = created_at + timedelta(hours=random.uniform(0, min(4, mttr_h * 0.1 + 0.1)))
            duration = int(mttr_h * 3600) if resolved_at else random.randint(0, 800000)

            internal_id = ""
            if random.random() < 0.06:
                types = ["WH | BUG ", "GT | PRODUCT BACKLOG ITEM ", "Enhancement | Enhancement"]
                t = random.choice(types)
                internal_id = f"{t}{random.randint(6400000, 6600000)} | {created_at.strftime('%d %B %Y')}"

            tag = random.choice(TAGS_LIST)

            records.append({
                "Number":               f"INC012{inc_base}",
                "Created":              fmt_dt(created_at),
                "Impacted user":        random.choice(IMPACTED_USERS),
                "First Assignment Group": first_group,
                "Assignment group":     assignment_group,
                "Service offering":     random.choice(SERVICE_OFFERINGS[assignment_group]),
                "Priority":             PRIORITY_LABELS[priority],
                "Urgency":              URGENCY_LABELS[urgency],
                "State":                state,
                "On hold reason":       hold_reason,
                "Assigned to":          random.choice(ASSIGNEES[assignment_group]),
                "Short description":    random.choice(SHORT_DESCRIPTIONS[assignment_group]),
                "Internal ID":          internal_id,
                "Tags":                 tag,
                "Updated":              fmt_dt(updated_at),
                "Updated by":           updated_by,
                "Made SLA":             str(made_sla).upper(),
                "SLA due":              fmt_dt(sla_due),
                "Resolution code":      resolution_code or "",
                "Resolved":             fmt_dt(resolved_at) if resolved_at else "",
                "Reopen count":         reopen_count,
                "Last reopened at":     "",
                "Reassignment count":   reassignment_count,
                "Duration":             duration,
                "Last Assignment Date": fmt_dt(last_assign),
                "Business duration":    business_dur or 0,
                "Resolution notes":     res_note or "",
            })
        cur += timedelta(days=1)

    df = pd.DataFrame(records)
    out = os.path.join(os.path.dirname(__file__), "incidents.csv")
    df.to_csv(out, index=False)
    print(f"Generated {len(df)} incidents -> {out}")
    print(f"Date range: {df['Created'].min()} to {df['Created'].max()}")
    print(f"\nAssignment group distribution:\n{df['Assignment group'].value_counts().to_string()}")
    print(f"\nTop 15 First Assignment Groups:\n{df['First Assignment Group'].value_counts().head(15).to_string()}")
    print(f"\nStates:\n{df['State'].value_counts().to_string()}")
    print(f"\nPriority:\n{df['Priority'].value_counts().to_string()}")
    return df


if __name__ == "__main__":
    generate(1200)
