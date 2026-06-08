#!/usr/bin/env python3
"""
ServiceNow Incident Data Generator
- 3 primary groups: DPS-WEB-L2, Global-Traceability-L2, CG-DPS-Automation-L2 (~1200 incidents, rich data)
- All additional groups from assignment_group_mappings.csv: ~100 incidents each
- All groups mapped to Tower + SDM for proper filter demo
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

# ── Tower / SDM for the 3 primary groups ──────────────────────────────────────
PRIMARY_GROUP_META = {
    "DPS-WEB-L2":           {"tower": "DES", "sdm": "Swet Bhushan"},
    "Global-Traceability-L2": {"tower": "DES", "sdm": "Swet Bhushan"},
    "CG-DPS-Automation-L2": {"tower": "DES", "sdm": "Swet Bhushan"},
}

FIRST_GROUP_POOLS = {
    "DPS-WEB-L2": [
        "A&I-ITSYS-DPM-L2","A2R-APMCare-EQRP-L2","A2R-APMCare-NG-DFHSE-L2","A2R-APMCare-Workforce-L2",
        "A2R-MT-Ecosystem-L2","ACCH-eClaims-Processing-L2","Ariba AB-GB-L2","Ariba-Sourcing-L2","Badge-L3",
        "Barir-L2","Barir-L3","CAM-Finance Support","CAM-Manufacturing Support","CDSS Digital Service Desk",
        "CG-A2R-APMCare-NG-Sustain-L2","CUS-L2","D2D-P2P-L2","DC-BRZ-SUS-L2","DIG-ChangePoint-L2",
        "DIG-SoftwareLib-L2","DIS-L2","DO-ChampionX-Hypercare","DPS-Automation-L2","DPS-DC-LAM&MCA-L2",
        "DPS-Web-Hypercare","DPS-WEB-L2","DPS-WH-L2","EMC-Application Monitoring","EMC-SIMS-L1",
        "ESM-CoE-L2","GBS-Digital-Finance-L2","GBS-Digital-Supply-L2","GBS-Digital-Support-L2",
        "Global Onsite Support","Global Service Desk","Global Service Desk-CAM Champions","H2R Payroll EH-L2",
        "INF-Digital Signage","ITINF-Enterprise Digital Workplace-L2","KLHUB-eClaims-Processing-L2",
        "LAM-eClaims-Processing-L2","M2C-Customer_Delivery_System_incident","M2C-Field Delivery Platform-L2",
        "MFG-L2","Mobility Infra Services-L3","OSS-SAP Logistics","OTM-L2","P&P-Master Data Support-L3",
        "P&P-STP-L2","PACS-L2","PDS-Ariba","PDS-GTS","Problem Management Process Team","PSD-L2","QMR-L2",
        "R2I-Competency-L2","R2I-QHSE-L2","R2R ACCOUNTS PAYABLE L2","R2R IDT TAN L2","R2R InterCo L2",
        "R2R-eClaimsMD-L2","R2R-eFinance-L2","R2R-Legacy-L2","R2R-Treasury-L2",
        "S&C-CUSTOMER CONTRACT REPORTS","SAP-R2R-CONCUR-L2","Security-L2","Segment-BSSA-COL-Support-L2","STP-L2",
    ],
    "Global-Traceability-L2": [
        "A2R-FMP Support-L2","Basis-L2","Basis-L3","CAM-Finance Support","CAM-Supply Chain Support",
        "D2D-MMLegacy-L2","D2D-P2P-L2","DIS-L2","DIS-WM-L2","DPS-WEB-L2","EAM-L2",
        "EMC-Application Monitoring","ESM-IT-DEVOPS","Global Onsite Support","Global Service Desk",
        "Global-Traceability-L2","M2C-Field Delivery Platform-L2","MFG-L2","OSS-SAP Ariba","OTM-L2",
        "P&P-Supply Chain Support-L2","P&SC-MRP-L2","PDS-DIS","PSD-L2","Security-CAM-L2","Security-L2",
        "STP-L2","Tech-MFG-L2",
    ],
    "CG-DPS-Automation-L2": [
        "A&I-ITSYS-IAM-L2","CG-DPS-Automation-L2","DPS-Automation-L2","DPS-WEB-L2",
        "GBS-Digital-Finance-L2","Global Service Desk","R2R-eClaimsMD-L2","Security-L2",
    ],
}

SERVICE_OFFERINGS = {
    "DPS-WEB-L2": [
        "Approve Buddy Web App.","ePermit","ApproveBuddy Web App.","GBS CI Tracker.",
        "DPS - Training Booking Portal (TEP)","Access Now","Sharepoint- CAF RDS","EMM DEP",
        "iWorkPlace.","eClaimsMobile.","SLBRide",
    ],
    "Global-Traceability-L2": [
        "Global Traceability","BlueWorld","BlueMM - IM (ITE)","BlueMM - WM (ITE)",
        "GT Mobile","Adhoc Reservation portal",
    ],
    "CG-DPS-Automation-L2": [
        "Generic Technical Service Offering","Materials Management - MCT-E","iWorkPlace.","eClaimsMobile.",
    ],
}

ASSIGNEES = {
    "DPS-WEB-L2": [
        "Saurabh Saraswat (SSaraswat2@slb.com)","Atharva Shrinivas Adam (AAdam20@slb.com)",
        "Shivam Kumar Rajput (SRajput6@slb.com)","Vinay Pal (VPal7@slb.com)","Swet Bhushan (SBhushan2@slb.com)",
    ],
    "Global-Traceability-L2": [
        "Vinay Pal (VPal7@slb.com)","Godavari Bai M R (GR51@slb.com)","Kris Cruickshank (KCruickshank@slb.com)",
    ],
    "CG-DPS-Automation-L2": [
        "Vishu Gupta (VGupta24@slb.com)","Murugan Mani (MMani5@slb.com)","Swet Bhushan (SBhushan2@slb.com)",
    ],
}

IMPACTED_USERS = [
    "Paul McLean (PMclean@slb.com)","Musah Yusufu (MYusufu@slb.com)","Neiby Eliana Rodriguez (NRodriguez29@slb.com)",
    "Les Craigue (LCraigue@slb.com)","Djamal Soilihi (DSoilihi@slb.com)","Colin St Croix (CStcroix@slb.com)",
    "Kris Cruickshank (KCruickshank@slb.com)","Aly Abdelzaher (AAbdelzaher2@slb.com)",
    "Vishu Gupta (VGupta24@slb.com)","Yurii Zelenko (YZelenko@slb.com)","Younes Atif (YAtif@slb.com)",
    "Kotchaphan Tosu (PTosu@slb.com)","Gareth Gough (GGough@slb.com)","Saurabh Saraswat (SSaraswat2@slb.com)",
    "Adaline Rexy Mary (RMary@slb.com)","Ryan Shim (RShim@slb.com)","Sufyan Eshtiwi (SEshtiwi@slb.com)",
    "Amy Rios (ARios16@slb.com)","Claire Findlay (CFindlay2@slb.com)","Magdalena Stoica (MStoica5@slb.com)",
    "Mihir Gandhi (MGandhi@slb.com)","Murugan Mani (MMani5@slb.com)","Sarah Johnson (SJohnson@slb.com)",
    "Priya Sharma (PSharma@slb.com)","Marcus Webb (MWebb@slb.com)","James Okafor (JOkafor@slb.com)",
    "Elena Rodriguez (ERodriguez@slb.com)","Ravi Patel (RPatel@slb.com)","Carlos Mendez (CMendez@slb.com)",
    "Lin Wei (LWei@slb.com)",
]

SHORT_DESCRIPTIONS = {
    "DPS-WEB-L2": [
        "Approvebuddy Web App is giving an error","ApproveBuddy Certification Issue",
        "Access permissions for the ePTW Global platform.","MCT SP Access - DPS-WEB-L2 - Top Priority",
        "GBS CI Tracker - Access control rules/logic clarification",
        "DPS - Training Booking Portal (TEP) - Unable to access","Sharepoint CAF-RDS access request",
        "EMM DEP - Device enrollment issue","iWorkPlace - Issue with desk booking permissions",
        "SLB Ride - Information missing from booking","Badge registration not working",
        "ePermit access required for field operations",
        "Approve Buddy Web App - login error after password reset",
        "TEP Communication Event Details PBI","GBS CI Tracker - User role configuration required",
        "Access Now - New user provisioning","eClaimsMobile - Unable to submit expense claim",
    ],
    "Global-Traceability-L2": [
        "GT- Blueworld - access issue","GT Mobile update issue - new blue MM version not working",
        "GT- GT Stores - Panida Tosu ()","KSAHR Letter generation Data fetch bot not running as expected",
        "Adhoc Reservation portal - Cannot submit reservation","BlueMM IM - copy paste functionality not working",
        "Global Traceability - user access provisioning","GT Mobile - App not loading after update",
        "BlueMM WM - Inventory sync issue","BlueWorld - access request for new team member",
        "BlueMM WM - Mobile application not syncing",
    ],
    "CG-DPS-Automation-L2": [
        "Materials Management - MCT-E access request","Generic Technical Service - automation script failure",
        "NIS Auto-Bot - Process failed with errors","iWorkPlace - automation not triggering",
        "Automation pipeline - data processing error","MCT SP Access required for materials team",
        "CG automation service - scheduled job failure",
    ],
}

# ── Per-tower short descriptions for additional groups ──────────────────────────
TOWER_DESCRIPTIONS = {
    "A&I": [
        "ADO pipeline build failure - deployment blocked",
        "GitHub access request - new team member onboarding",
        "SonarQube license issue - code scan not running",
        "Wiki page permissions error - unable to edit content",
        "BI Dashboard not loading - data refresh failed",
        "EAI integration error - message processing failure",
        "i3PM resource booking not accessible",
        "Insomnia API testing tool - authentication error",
        "ITRecharge portal - recharge transaction failed",
        "MEND security scan - vulnerability report not generated",
        "SAT tool - performance degradation reported",
        "GitHub Actions - workflow run failing with exit code 1",
        "ADO boards - sprint items not displaying correctly",
        "EAI Marketplace - product listing sync error",
        "BI Dashboard - incorrect data shown after latest refresh",
        "Wiki - broken links after page migration",
        "DevOps monitoring alert - false positive suppression needed",
        "GG portal - user access not provisioned after approval",
        "i3PM project milestone - email notification not triggering",
        "SonarQube quality gate - blocking release pipeline",
    ],
    "D&A": [
        "Data ingestion pipeline - batch job failed overnight",
        "PowerBI report - data not refreshed since yesterday",
        "Master Data - incorrect material code in SAP",
        "BI Platform - report export to Excel not working",
        "BIDevOps pipeline - deployment to prod environment failed",
        "COP BI dashboard - filter not working correctly",
        "Data reliability check - 3000 records flagged as anomalies",
        "OSSIV Reporting - incorrect figures in monthly report",
        "D&A Ingestion - source system connection timeout",
        "Master Data SCM - duplicate vendor records identified",
        "FinPNP data - GL account mapping discrepancy",
        "Global Dashboard - KPI tiles showing null values",
        "BIDevOps R2R - reconciliation report missing data",
        "PowerBI gateway - scheduled refresh failing since 06:00",
        "Data Platform ingestion - schema mismatch after upgrade",
        "Master Data Customer - address field truncation issue",
        "COP BI - dashboard load time exceeding 30 seconds",
        "HSDFE data - missing records in downstream report",
        "BIDevOps monitoring - alert threshold misconfigured",
        "D&A SCM - inventory valuation report wrong totals",
    ],
    "DES": [
        "APM Core NG - plant maintenance order not creating",
        "FMP Support - field maintenance request stuck in approval",
        "Maximo work order - unable to close after completion",
        "A2R FMP - asset register not syncing with SAP",
        "BI Platform - report subscription email not sent",
        "R2I Legal - document submission portal access denied",
        "Competency matrix - training completion not recorded",
        "Maximo PRS - purchase requisition approval workflow broken",
        "APM NG DFHSE - safety incident form not submitting",
        "A2R Mateo - integration with ERP showing stale data",
        "MT Ecosystem - data feed interruption from source system",
        "APM Core NG - notification email not sent to technician",
        "FMP Support - SLA breach alert not triggering",
        "Maximo WEC - work execution centre login issue",
        "R2H Competency - L2 assessment module error",
        "APM NG DW - data warehouse refresh job failed",
        "A2R FMP - preventive maintenance schedule export error",
        "Maximo - asset hierarchy not loading in mobile app",
        "APM NG TH - thermal performance data not displaying",
        "CG BI Support - scheduled report not delivered",
    ],
    "SAP": [
        "SAP FI - month-end closing posting error",
        "SAP FI - vendor invoice blocked for payment",
        "SAP DI - data interface job failed during nightly run",
        "SAP FI - GL account determination error in billing",
        "SAP - cost centre allocation report incorrect",
        "SAP FI - bank statement upload not processing",
        "SAP DI - interface mapping error for new country rollout",
        "SAP FI - tax code configuration required for new entity",
        "SAP - depreciation run failed for asset class",
        "SAP FI - intercompany reconciliation discrepancy",
        "SAP - purchase order approval workflow stuck",
        "SAP DI - data extraction for external audit delayed",
        "SAP FI - payment run blocked by duplicate invoice check",
        "SAP - profit centre assignment missing on posting",
        "SAP DI - connection to external bank portal timed out",
    ],
}

TOWER_SERVICES = {
    "A&I": ["Azure DevOps","GitHub Enterprise","SonarQube","Confluence Wiki","BI Dashboard Platform",
            "EAI Integration Bus","i3PM","Insomnia API Tool","ITRecharge","MEND Security","SAT Platform"],
    "D&A": ["PowerBI Platform","Data Ingestion Pipeline","Master Data Management","BIDevOps Platform",
            "COP BI Dashboard","OSSIV Reporting","Data Reliability Service","Global Dashboard","HSDFE Platform"],
    "DES": ["APM Core NG","FMP Support Platform","Maximo","A2R Platform","BI Platform","R2I Legal Portal",
            "Competency Management","MT Ecosystem","A2R Mateo"],
    "SAP": ["SAP FI Module","SAP DI Interface","SAP CO Module","SAP MM Module","SAP ERP Platform"],
}

RESOLUTION_CODES = [
    "Solution Provided","User Training & Documentation Provided","Change/Enhancement Requested",
    "No Fix Needed","User Not Available","Workaround Provided","Closed/Resolved by User",
]

RESOLUTION_NOTES = [
    "Root cause:\nAccess was not provisioned after the latest system upgrade.\n\nResolution steps:\n- Identified the missing role assignment\n- Provisioned the required access for the user\n- User confirmed successful access via chat",
    "Root cause:\nConfiguration mismatch after recent deployment.\n\nResolution steps:\n- Reviewed configuration settings\n- Applied correct configuration\n- Verified with user that issue is resolved",
    "Root cause:\nThird-party system unavailability caused the integration failure.\n\nResolution steps:\n- Escalated to third-party vendor\n- Monitored restoration\n- Confirmed service restored and data re-synced",
    "Root cause:\nUser configuration issue - incorrect settings applied.\n\nResolution steps:\n- Reset user configuration to default\n- Applied correct policy settings\n- Verified with user that issue is resolved",
    "Solution Provided - User guided through the process and issue resolved.\n\nResolution steps:\n- Walked user through the correct steps\n- User confirmed resolution via follow-up chat",
    "Root cause:\nPermission misconfiguration after role change.\n\nResolution steps:\n- Reviewed current role assignments\n- Updated permissions in the system\n- User confirmed access restored",
]

TAGS_LIST = [
    "", "", "", "Multiple Reassignment", "Awaiting Change",
    "Reopened -Asking for additional changes", "Change Request",
    "Reopened - Different assignment queue", "Reopen - Incorrectly reopen by end user",
]

STATES        = ["On Hold", "Resolved", "In Progress", "Closed", "Open"]
STATE_WEIGHTS = [0.15, 0.55, 0.15, 0.10, 0.05]
ON_HOLD_REASONS = [
    "Awaiting Impacted User","Awaiting Change","Awaiting Third Party",
    "Pending Approval","Awaiting Information",
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


def make_incident(inc_num, assignment_group, tower, sdm, created_at, priority=None):
    """Generate a single incident row dict."""
    if priority is None:
        priority = random.choices([1, 2, 3, 4], weights=[2, 10, 28, 60])[0]
    urgency = {1: 1, 2: random.choice([1, 2]), 3: random.choice([2, 3]), 4: 3}[priority]

    mttr_h = {1: random.uniform(0.5, 6), 2: random.uniform(4, 36),
              3: random.uniform(12, 96), 4: random.uniform(24, 240)}[priority]

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
        res_note = random.choice(RESOLUTION_NOTES)
    elif state == "On Hold":
        hold_reason = random.choice(ON_HOLD_REASONS)

    sla_due_h = {1: 4, 2: 8, 3: 24, 4: 72}[priority]
    sla_due = created_at + timedelta(hours=sla_due_h)
    if resolved_at:
        made_sla = resolved_at <= sla_due
    elif state in ["Open", "In Progress", "On Hold"]:
        made_sla = datetime.now() <= sla_due if sla_due > datetime.now() else random.random() > 0.3
    else:
        made_sla = True

    reass_w = [60, 25, 10, 4, 1] if priority >= 3 else [40, 30, 20, 8, 2]
    reassignment_count = random.choices([0, 1, 2, 3, 4], weights=reass_w)[0]
    reopen_count = random.choices([0, 1, 2], weights=[90, 8, 2])[0]

    updated_at = resolved_at if resolved_at else (
        created_at + timedelta(hours=random.uniform(0.5, min(max(age_days, 1) * 24, 120))))
    last_assign = created_at + timedelta(hours=random.uniform(0, min(4, mttr_h * 0.1 + 0.1)))
    duration = int(mttr_h * 3600) if resolved_at else random.randint(0, 800000)

    # Pick group-specific or tower-generic data
    if assignment_group in PRIMARY_GROUP_META:
        first_group_pool = FIRST_GROUP_POOLS[assignment_group]
        weights = []
        for g in first_group_pool:
            if g == assignment_group: weights.append(6)
            elif g in ("Global Service Desk", "Global Onsite Support"): weights.append(3)
            else: weights.append(1)
        first_group = random.choices(first_group_pool, weights=weights)[0]
        service = random.choice(SERVICE_OFFERINGS[assignment_group])
        description = random.choice(SHORT_DESCRIPTIONS[assignment_group])
        assignee = random.choice(ASSIGNEES[assignment_group])
        updated_by_email = assignee.split("(")[1].rstrip(")") if "(" in assignee else assignee
    else:
        first_group = assignment_group  # typically self-assigned at L2
        service = random.choice(TOWER_SERVICES.get(tower, TOWER_SERVICES["DES"]))
        description = random.choice(TOWER_DESCRIPTIONS.get(tower, TOWER_DESCRIPTIONS["DES"]))
        # Generate realistic assignee names based on SDM
        sdm_prefix = sdm.split()[0].lower()
        assignee_num = random.randint(1, 15)
        assignee = f"{sdm_prefix}_tech_{assignee_num:02d} ({sdm_prefix}{assignee_num:02d}@slb.com)"
        updated_by_email = f"{sdm_prefix}{random.randint(1, 15):02d}@slb.com"

    tag = random.choice(TAGS_LIST)
    internal_id = ""
    if random.random() < 0.06:
        types = ["WH | BUG ", "GT | PRODUCT BACKLOG ITEM ", "Enhancement | Enhancement"]
        t = random.choice(types)
        internal_id = f"{t}{random.randint(6400000, 6600000)} | {created_at.strftime('%d %B %Y')}"

    return {
        "Number":                 f"INC012{inc_num}",
        "Created":                fmt_dt(created_at),
        "Impacted user":          random.choice(IMPACTED_USERS),
        "First Assignment Group": first_group,
        "Assignment group":       assignment_group,
        "Tower":                  tower,
        "SDM":                    sdm,
        "Service offering":       service,
        "Priority":               PRIORITY_LABELS[priority],
        "Urgency":                URGENCY_LABELS[urgency],
        "State":                  state,
        "On hold reason":         hold_reason,
        "Assigned to":            assignee,
        "Short description":      description,
        "Internal ID":            internal_id,
        "Tags":                   tag,
        "Updated":                fmt_dt(updated_at),
        "Updated by":             updated_by_email,
        "Made SLA":               str(made_sla).upper(),
        "SLA due":                fmt_dt(sla_due),
        "Resolution code":        resolution_code or "",
        "Resolved":               fmt_dt(resolved_at) if resolved_at else "",
        "Reopen count":           reopen_count,
        "Last reopened at":       "",
        "Reassignment count":     reassignment_count,
        "Duration":               duration,
        "Last Assignment Date":   fmt_dt(last_assign),
        "Business duration":      business_dur or 0,
        "Resolution notes":       res_note or "",
    }


def generate(n_primary=1200):
    records = []
    inc_base = 447638

    # ── Phase 1: Primary 3 groups (rich data, daily volume model) ────────────
    cur = START
    while cur <= END and len(records) < n_primary:
        n = daily_volume(cur)
        for _ in range(n):
            if len(records) >= n_primary:
                break
            inc_base += random.randint(1, 3)
            assignment_group = random.choices(
                ["DPS-WEB-L2", "Global-Traceability-L2", "CG-DPS-Automation-L2"],
                weights=[0.55, 0.30, 0.15]
            )[0]
            meta = PRIMARY_GROUP_META[assignment_group]
            created_at = rand_dt(cur, cur + timedelta(hours=23, minutes=59))
            rec = make_incident(inc_base, assignment_group, meta["tower"], meta["sdm"], created_at)
            records.append(rec)
        cur += timedelta(days=1)

    print(f"Phase 1 complete: {len(records)} primary-group incidents")

    # ── Phase 2: Additional groups from mappings CSV (~100 each) ─────────────
    mappings_path = os.path.join(os.path.dirname(__file__), "assignment_group_mappings.csv")
    mappings_df = pd.read_csv(mappings_path)

    # Deduplicate by assignment_group, keep first occurrence
    seen = set(PRIMARY_GROUP_META.keys())
    additional_groups = []
    for _, row in mappings_df.iterrows():
        grp = str(row["assignment_group"]).strip()
        if grp and grp not in seen:
            seen.add(grp)
            additional_groups.append({
                "assignment_group": grp,
                "tower": str(row["tower"]).strip(),
                "sdm": str(row["sdm"]).strip(),
            })

    print(f"Generating data for {len(additional_groups)} additional assignment groups (~100 each)...")

    total_span_seconds = int((END - START).total_seconds())

    for grp_info in additional_groups:
        grp = grp_info["assignment_group"]
        tower = grp_info["tower"]
        sdm = grp_info["sdm"]
        count = random.randint(90, 115)  # ~100

        for _ in range(count):
            inc_base += random.randint(1, 3)
            created_at = START + timedelta(seconds=random.randint(0, total_span_seconds))
            # Push weekend dates to Monday
            if created_at.weekday() >= 5:
                created_at += timedelta(days=(7 - created_at.weekday()))
            # Business hours
            if created_at.hour < 7 or created_at.hour > 20:
                created_at = created_at.replace(hour=random.randint(8, 18))

            rec = make_incident(inc_base, grp, tower, sdm, created_at)
            records.append(rec)

    # ── Save ──────────────────────────────────────────────────────────────────
    df = pd.DataFrame(records)
    out = os.path.join(os.path.dirname(__file__), "incidents.csv")
    df.to_csv(out, index=False)
    print(f"\nGenerated {len(df)} total incidents -> {out}")
    print(f"Date range: {df['Created'].min()} to {df['Created'].max()}")
    print(f"\nAssignment groups: {df['Assignment group'].nunique()}")
    print(f"Towers: {df['Tower'].nunique()} -> {sorted(df['Tower'].unique())}")
    print(f"SDMs: {df['SDM'].nunique()} -> {sorted(df['SDM'].unique())}")
    print(f"\nTop 10 assignment groups by volume:\n{df['Assignment group'].value_counts().head(10).to_string()}")
    print(f"\nBy Tower:\n{df['Tower'].value_counts().to_string()}")
    print(f"\nBy SDM:\n{df['SDM'].value_counts().to_string()}")
    return df


if __name__ == "__main__":
    generate(1200)
