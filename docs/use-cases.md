# Revised use-case specification

7 October 2026. Companion to [interim review](interim-review.md). This is a target design with explicit implementation status, not a claim that every use case already works.

| Actor                        | Implemented goals                                                                                                                                                                                                 | Remaining / proposed goals                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Public visitor               | View demo homepage and portal guidance (this revision); register; log in                                                                                                                                          | View verified hospital contacts, published services/doctors; recover password  |
| Patient                      | Edit contact profile; browse available doctors/slots; book/reschedule/cancel; view appointments, own records and bills; read in-app notices; request bounded department guidance; submit completed-visit feedback | Email/SMS preferences and external delivery; password recovery                 |
| Doctor                       | View own appointments/schedules and polling queue; access assigned patient's history; start/save/complete consultation; create/revise prescriptions                                                               | Consolidated dashboard timeline and Socket.IO updates                          |
| Receptionist                 | Register walk-in; search/edit intake; book/reschedule/cancel/check-in; generate itemised bill and record received payment                                                                                         | Verified onboarding delivery                                                   |
| Administrator                | Staff lifecycle; create/list departments; appointments/schedules; billing/reversal; reports; feedback review; audit review                                                                                        | Patient activation; department editing/deactivation; hospital settings; charts |
| Email/SMS gateway (external) | None                                                                                                                                                                                                              | Accept delivery requests and return authenticated delivery status              |

Authentication is a precondition on protected use cases. It is not a repeated `include` arrow from every action. Feedback requires a completed owned visit. Prescription revision requires the assigned doctor, existing completed record and reason. Booking includes availability/conflict validation. Symptom guidance includes internal rules; rule evaluation is not an external actor. Successful consultation completion triggers billing and a stored notification within the transaction; external delivery is asynchronous.

The PlantUML source below uses actor associations and `<<include>>` only for mandatory reusable behaviour. Its colours/status labels distinguish pending work. For the final report, render each view on a separate landscape page or figure; retain the source alongside exported SVG/PDF. The original PDF remains unchanged.

```plantuml
@startuml patient_public
left to right direction
skinparam shadowing false
skinparam packageStyle rectangle
skinparam usecaseBackgroundColor #F1F7FC
actor Visitor
actor Patient
actor "Email / SMS gateway\n[planned]" as Gateway
rectangle "Smart HMS — public and patient" {
  usecase "View public demo homepage" as Home
  usecase "Register / log in" as Login
  usecase "Recover password\n[missing]" as Reset #FFF2D9
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
  usecase "Deliver email / SMS\n[planned]" as Deliver #FFF2D9
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
  usecase "View own queue and schedule" as Queue
  usecase "Review assigned patient history" as History
  usecase "Manage consultation" as Consult
  usecase "Create / revise prescription" as Prescription
  usecase "Review allergies" as Allergy
  usecase "Register walk-in / edit intake" as Intake
  usecase "Manage bookings / check-in" as Checkin
  usecase "Generate itemised bill" as Bill
  usecase "Record received payment" as Payment
}
Doctor -- Queue
Doctor -- History
Doctor -- Consult
Doctor -- Prescription
Prescription ..> Allergy : <<include>>
Receptionist -- Intake
Receptionist -- Checkin
Receptionist -- Bill
Receptionist -- Payment
@enduml

@startuml administration
left to right direction
skinparam shadowing false
actor Administrator as Admin
rectangle "Smart HMS — administration" {
  usecase "Manage staff accounts" as Staff
  usecase "Create / list departments" as Departments
  usecase "Manage appointments and schedules" as Schedule
  usecase "Review billing / reverse payment" as Billing
  usecase "Generate reports" as Reports
  usecase "Review feedback" as Feedback
  usecase "Review audit log" as Audit
  usecase "Deactivate / reactivate patients\n[missing]" as Patients #FFF2D9
  usecase "Edit / deactivate departments\n[missing]" as EditDepartment #FFF2D9
  usecase "Configure hospital\n[missing]" as Settings #FFF2D9
  usecase "Explore analytics charts\n[planned]" as Charts #FFF2D9
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
@enduml
```

Diagram acceptance: external actors outside the boundary; internal rule engine inside; readable labels at report print size; no relationships that imply every booking uses symptom guidance; no broad administrator access to confidential clinical content merely because the actor is labelled “Admin”.
