# Revised use case specification

Updated 13 October 2026. The rendered SVG/PNG figures in [diagrams](diagrams) describe implemented application behaviour. The external SMTP/SMS provider is configured only for local/mocked tests; live provider verification remains pending. Diagram source is retained in PlantUML below and editable Graphviz alongside the rendered figures.

| Actor             | Implemented goals                                                                                                                       | Acceptance boundary                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Visitor           | View published hospital/service/doctor directory, register, sign in, request password recovery, select language                         | Approved publication is explicit; actual SMTP pending |
| Patient           | Maintain contacts; book/reschedule/cancel; view own records/bills; feedback; guidance; notices and delivery preferences/history; charts | Human and language review; guide accepts English only |
| Doctor            | Own live paginated queue, chronological daily timeline, schedules, assigned records, consultations and prescription revisions           | Clinician review                                      |
| Receptionist      | Walk-in registration/intake, bookings, check-in, itemised billing and received-payment recording                                        | Operational acceptance                                |
| Administrator     | Staff/patient access, department lifecycle, approved publication, reports/exports, feedback, audits and delivery monitoring             | Actual hosting/storage/provider access pending        |
| Email/SMS gateway | Adapter processing and provider status handling                                                                                         | Live delivery not verified                            |

Authentication is a precondition on protected use cases. It is not a repeated `include` arrow from every action. Feedback requires a completed owned visit. Prescription revision requires the assigned doctor, existing completed record and reason. Booking includes availability/conflict validation. Symptom guidance includes internal rules; rule evaluation is not an external actor. Successful consultation completion triggers billing and a stored notification within the transaction; external delivery is asynchronous.

The PlantUML source below uses actor associations and `<<include>>` only for mandatory reusable behaviour. External live-service acceptance remains separate from implemented adapters. For the final report, render each view on a separate landscape page or figure; retain the source alongside exported SVG/PDF. The original PDF remains unchanged.

```plantuml
@startuml patient_public
left to right direction
skinparam shadowing false
skinparam packageStyle rectangle
skinparam usecaseBackgroundColor #F1F7FC
actor Visitor
actor Patient
actor "Email / SMS gateway\n[live setup pending]" as Gateway
rectangle "Smart HMS — public and patient" {
  usecase "View public information and approved directory" as Home
  usecase "Register / log in" as Login
  usecase "Recover password" as Reset
  usecase "Update contact profile" as Profile
  usecase "Browse doctors and slots" as Browse
  usecase "Book appointment" as Book
  usecase "Validate availability" as Validate
  usecase "Reschedule / cancel visit" as Change
  usecase "View records, bills and history" as Records
  usecase "Get department guidance" as Guide
  usecase "Evaluate bounded rules" as Rules
  usecase "Read in-app notifications" as Notices
  usecase "Submit completed-visit feedback" as Feedback
  usecase "Queue email / SMS update\n[adapters implemented]" as Deliver
  usecase "Set delivery preferences" as Preferences
  usecase "View delivery history" as DeliveryHistory
  usecase "View own appointment charts" as Charts
}
Visitor -- Home
Visitor -- Login
Visitor -- Reset
Patient -- Profile
Patient -- Browse
Patient -- Book
Patient -- Change
Patient -- Records
Patient -- Guide
Patient -- Notices
Patient -- Feedback
Patient -- Preferences
Patient -- DeliveryHistory
Patient -- Charts
Book ..> Validate : <<include>>
Guide ..> Rules : <<include>>
Gateway -- Deliver
Gateway -- Reset
@enduml

@startuml care_team
left to right direction
skinparam shadowing false
actor Doctor
actor Receptionist
rectangle "Smart HMS — care team" {
  usecase "View queue and daily timeline" as Queue
  usecase "Review assigned patient history" as History
  usecase "Manage consultation" as Consult
  usecase "Create / revise prescription" as Prescription
  usecase "Review allergies" as Allergy
  usecase "Register walk-in / edit intake" as Intake
  usecase "Manage bookings / check-in" as Checkin
  usecase "Generate itemised bill" as Bill
  usecase "Record received payment" as Payment
  usecase "View role-scoped appointment charts" as Charts
}
Doctor -- Queue
Doctor -- History
Doctor -- Consult
Doctor -- Prescription
Doctor -- Allergy
Receptionist -- Intake
Receptionist -- Checkin
Receptionist -- Bill
Receptionist -- Payment
Doctor -- Charts
Receptionist -- Charts
@enduml

@startuml administration
left to right direction
skinparam shadowing false
actor Administrator as Admin
rectangle "Smart HMS — administration" {
  usecase "Manage staff accounts / approved public profiles" as Staff
  usecase "Create / list departments" as Departments
  usecase "Manage appointments and schedules" as Schedule
  usecase "Review billing / reverse payment" as Billing
  usecase "Generate reports and export CSV / PDF" as Reports
  usecase "Review feedback" as Feedback
  usecase "Review audit log" as Audit
  usecase "Deactivate / reactivate patients" as Patients
  usecase "Edit / deactivate departments" as EditDepartment
  usecase "Draft / publish / withdraw hospital information" as Settings
  usecase "Explore dashboard charts" as Charts
  usecase "Monitor email / SMS delivery" as DeliveryHistory
}
Admin -- Staff
Admin -- Departments
Admin -- Schedule
Admin -- Billing
Admin -- Reports
Admin -- Feedback
Admin -- Audit
Admin -- Patients
Admin -- EditDepartment
Admin -- Settings
Admin -- Charts
Admin -- DeliveryHistory
@enduml
```

Diagram acceptance: external actors outside the boundary; internal rule engine inside; readable labels at report print size; no relationships that imply every booking uses symptom guidance; no broad administrator access to confidential clinical content merely because the actor is labelled “Admin”.

## Rendered figures

The editable DOT sources generate the following diagrams with `python3 scripts/docs/render-diagrams.py`. The four focused figures split public access from the patient workspace for readability. Actor rectangles use the standard `<<actor>>` classifier notation. Authentication is a precondition; an external gateway association represents an implemented adapter, not verified live delivery.

![Public access](diagrams/01-public.svg)

![Patient workspace](diagrams/02-patient.svg)

![Care team](diagrams/03-care-team.svg)

![Administration](diagrams/04-administration.svg)
