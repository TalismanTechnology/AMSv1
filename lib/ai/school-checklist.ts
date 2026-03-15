/**
 * Comprehensive checklist of documents/information every K-12 school should have.
 * Organized by category. Each item has a unique ID, name, priority, and description.
 */

export type ChecklistPriority = "critical" | "recommended" | "nice-to-have";

export interface ChecklistItem {
  id: string;
  name: string;
  description: string;
  priority: ChecklistPriority;
}

export interface ChecklistCategory {
  id: string;
  name: string;
  items: ChecklistItem[];
}

export const SCHOOL_CHECKLIST: ChecklistCategory[] = [
  // ─────────────────────────────────────────────
  // 1. GOVERNANCE & ADMINISTRATION
  // ─────────────────────────────────────────────
  {
    id: "governance",
    name: "Governance & Administration",
    items: [
      { id: "gov-01", name: "School Mission & Vision Statement", description: "Official mission, vision, and core values of the school", priority: "critical" },
      { id: "gov-02", name: "School Board Policies", description: "Board governance policies and bylaws", priority: "critical" },
      { id: "gov-03", name: "Organizational Chart", description: "Administrative structure and chain of command", priority: "recommended" },
      { id: "gov-04", name: "School Improvement Plan", description: "Multi-year strategic improvement goals and action steps", priority: "recommended" },
      { id: "gov-05", name: "Accreditation Status & Reports", description: "Current accreditation status and related documentation", priority: "recommended" },
      { id: "gov-06", name: "Annual School Report / Report Card", description: "Yearly performance summary shared with community", priority: "recommended" },
      { id: "gov-07", name: "Board Meeting Schedule & Minutes", description: "Schedule of board meetings and published minutes", priority: "nice-to-have" },
      { id: "gov-08", name: "School History & Profile", description: "Background information about the school", priority: "nice-to-have" },
      { id: "gov-09", name: "Administrative Contact Directory", description: "Names, roles, emails, and phone numbers for admin staff", priority: "critical" },
      { id: "gov-10", name: "School Hours & Bell Schedule", description: "Daily start/end times and period schedules", priority: "critical" },
      { id: "gov-11", name: "School Calendar (Academic Year)", description: "Full academic calendar with holidays, breaks, and key dates", priority: "critical" },
      { id: "gov-12", name: "Staff Directory", description: "Complete directory of teachers and staff with contact info", priority: "recommended" },
      { id: "gov-13", name: "Parent-Teacher Organization Info", description: "PTA/PTO structure, meeting schedule, and how to join", priority: "nice-to-have" },
      { id: "gov-14", name: "School Naming / Mascot / Colors", description: "Official school branding and identity information", priority: "nice-to-have" },
    ],
  },

  // ─────────────────────────────────────────────
  // 2. ENROLLMENT & REGISTRATION
  // ─────────────────────────────────────────────
  {
    id: "enrollment",
    name: "Enrollment & Registration",
    items: [
      { id: "enr-01", name: "Enrollment / Registration Procedures", description: "Step-by-step process for enrolling new students", priority: "critical" },
      { id: "enr-02", name: "Registration Forms & Required Documents", description: "List of forms and documents needed for enrollment", priority: "critical" },
      { id: "enr-03", name: "Age & Residency Requirements", description: "Eligibility criteria for enrollment by age and residence", priority: "critical" },
      { id: "enr-04", name: "Transfer Student Procedures", description: "Process for incoming and outgoing transfer students", priority: "recommended" },
      { id: "enr-05", name: "Open Enrollment / School Choice Policy", description: "Policies for inter-district or magnet/charter enrollment", priority: "recommended" },
      { id: "enr-06", name: "Lottery / Waitlist Procedures", description: "How lottery-based admissions or waitlists work", priority: "nice-to-have" },
      { id: "enr-07", name: "Kindergarten Readiness / Pre-K Info", description: "Information for families with incoming kindergarteners", priority: "recommended" },
      { id: "enr-08", name: "Withdrawal / Disenrollment Procedures", description: "Process for withdrawing a student from the school", priority: "recommended" },
      { id: "enr-09", name: "Tuition & Fee Schedule", description: "Breakdown of any tuition, fees, or required payments", priority: "critical" },
      { id: "enr-10", name: "Financial Aid / Scholarship Information", description: "Available financial assistance and how to apply", priority: "recommended" },
      { id: "enr-11", name: "New Student Orientation Info", description: "Details about orientation events for new families", priority: "nice-to-have" },
    ],
  },

  // ─────────────────────────────────────────────
  // 3. STUDENT HANDBOOK & POLICIES
  // ─────────────────────────────────────────────
  {
    id: "student-handbook",
    name: "Student Handbook & Policies",
    items: [
      { id: "shb-01", name: "Student / Parent Handbook", description: "Comprehensive handbook covering school rules, expectations, and procedures", priority: "critical" },
      { id: "shb-02", name: "Student Code of Conduct", description: "Behavioral expectations and standards for students", priority: "critical" },
      { id: "shb-03", name: "Dress Code / Uniform Policy", description: "Requirements for student attire and appearance", priority: "critical" },
      { id: "shb-04", name: "Attendance Policy", description: "Rules for absences, tardiness, and truancy", priority: "critical" },
      { id: "shb-05", name: "Excused vs. Unexcused Absence Criteria", description: "Definitions and documentation requirements for absences", priority: "recommended" },
      { id: "shb-06", name: "Tardy Policy", description: "Rules and consequences for late arrivals", priority: "recommended" },
      { id: "shb-07", name: "Make-Up Work Policy", description: "Procedures for completing missed assignments due to absence", priority: "recommended" },
      { id: "shb-08", name: "Cell Phone / Electronic Device Policy", description: "Rules for personal devices during school hours", priority: "critical" },
      { id: "shb-09", name: "Acceptable Use Policy (Technology)", description: "Rules for using school technology, internet, and networks", priority: "critical" },
      { id: "shb-10", name: "Social Media Policy (Students)", description: "Guidelines for student social media use", priority: "recommended" },
      { id: "shb-11", name: "Locker / Personal Property Policy", description: "Rules for lockers, personal items, and searches", priority: "nice-to-have" },
      { id: "shb-12", name: "Student ID / Badge Policy", description: "Requirements for student identification", priority: "nice-to-have" },
      { id: "shb-13", name: "Visitor Policy", description: "Procedures for campus visitors and check-in", priority: "recommended" },
      { id: "shb-14", name: "Lost and Found Procedures", description: "How lost items are handled and reclaimed", priority: "nice-to-have" },
    ],
  },

  // ─────────────────────────────────────────────
  // 4. DISCIPLINE & BEHAVIOR
  // ─────────────────────────────────────────────
  {
    id: "discipline",
    name: "Discipline & Behavior",
    items: [
      { id: "dis-01", name: "Discipline Policy & Procedures", description: "Framework for addressing behavioral issues including consequences", priority: "critical" },
      { id: "dis-02", name: "Anti-Bullying / Anti-Harassment Policy", description: "Policies addressing bullying, cyberbullying, and harassment", priority: "critical" },
      { id: "dis-03", name: "Bullying Reporting Procedures", description: "How students, parents, and staff can report bullying incidents", priority: "critical" },
      { id: "dis-04", name: "Suspension & Expulsion Procedures", description: "Due process for in-school suspension, out-of-school suspension, and expulsion", priority: "critical" },
      { id: "dis-05", name: "Zero Tolerance Policies", description: "Policies for weapons, drugs, violence, and other zero-tolerance offenses", priority: "critical" },
      { id: "dis-06", name: "Restorative Justice / Positive Discipline", description: "Alternative discipline approaches and restorative practices", priority: "recommended" },
      { id: "dis-07", name: "Behavior Intervention Plan (BIP) Info", description: "Information on behavioral intervention plans and support", priority: "recommended" },
      { id: "dis-08", name: "Student Due Process Rights", description: "Students' rights during disciplinary proceedings", priority: "critical" },
      { id: "dis-09", name: "Grievance / Appeal Procedures (Students)", description: "How students and families can appeal disciplinary decisions", priority: "recommended" },
      { id: "dis-10", name: "Hazing Policy", description: "Prohibition and consequences for hazing activities", priority: "recommended" },
      { id: "dis-11", name: "Gang Activity / Affiliation Policy", description: "Policy addressing gang-related behavior and symbols", priority: "recommended" },
      { id: "dis-12", name: "Substance Abuse Policy (Students)", description: "Policies on alcohol, tobacco, vaping, and drug use by students", priority: "critical" },
      { id: "dis-13", name: "Search & Seizure Policy", description: "Policies on searching students, lockers, and personal property", priority: "recommended" },
    ],
  },

  // ─────────────────────────────────────────────
  // 5. ACADEMICS & CURRICULUM
  // ─────────────────────────────────────────────
  {
    id: "academics",
    name: "Academics & Curriculum",
    items: [
      { id: "acad-01", name: "Curriculum Overview / Course Catalog", description: "Summary of subjects, courses, and curriculum framework", priority: "critical" },
      { id: "acad-02", name: "Grade-Level Learning Standards", description: "Expected learning outcomes by grade level", priority: "recommended" },
      { id: "acad-03", name: "Grading Policy & Scale", description: "How grades are calculated and what the grading scale is", priority: "critical" },
      { id: "acad-04", name: "Report Card / Progress Report Schedule", description: "When and how academic progress is communicated", priority: "critical" },
      { id: "acad-05", name: "Honor Roll / Academic Recognition", description: "Criteria for honor roll and academic awards", priority: "nice-to-have" },
      { id: "acad-06", name: "Homework Policy", description: "Expectations for homework frequency, duration, and late work", priority: "recommended" },
      { id: "acad-07", name: "Academic Integrity / Cheating Policy", description: "Policies on plagiarism, cheating, and academic dishonesty", priority: "critical" },
      { id: "acad-08", name: "Grade Promotion / Retention Policy", description: "Criteria for advancing to the next grade level", priority: "critical" },
      { id: "acad-09", name: "Graduation Requirements", description: "Credits, courses, and other requirements for graduation", priority: "critical" },
      { id: "acad-10", name: "AP / IB / Dual Enrollment Info", description: "Advanced academic programs and enrollment details", priority: "recommended" },
      { id: "acad-11", name: "Gifted & Talented Program", description: "Identification process and services for gifted students", priority: "recommended" },
      { id: "acad-12", name: "Tutoring / Academic Support Services", description: "Available tutoring, study halls, and academic help resources", priority: "recommended" },
      { id: "acad-13", name: "Summer School / Credit Recovery", description: "Options for summer learning and making up failed courses", priority: "recommended" },
      { id: "acad-14", name: "Standardized Testing Schedule & Info", description: "Details on state tests, SAT/ACT, and other assessments", priority: "critical" },
      { id: "acad-15", name: "Testing Accommodations Info", description: "Available accommodations for testing and how to request them", priority: "recommended" },
      { id: "acad-16", name: "Parent-Teacher Conference Schedule", description: "When and how conferences are held", priority: "recommended" },
      { id: "acad-17", name: "Student Learning Management System (LMS) Guide", description: "How to access and use the school's online learning platform", priority: "recommended" },
      { id: "acad-18", name: "Textbook / Materials Policy", description: "How textbooks are distributed, returned, and replacement fees", priority: "nice-to-have" },
      { id: "acad-19", name: "Field Trip Academic Integration Policy", description: "How field trips tie into curriculum goals", priority: "nice-to-have" },
      { id: "acad-20", name: "Class Size / Student-Teacher Ratio Info", description: "Information about class sizes and staffing ratios", priority: "nice-to-have" },
    ],
  },

  // ─────────────────────────────────────────────
  // 6. SPECIAL EDUCATION & STUDENT SERVICES
  // ─────────────────────────────────────────────
  {
    id: "special-education",
    name: "Special Education & Student Services",
    items: [
      { id: "sped-01", name: "Special Education Overview / Parent Guide", description: "Introduction to special education services and rights", priority: "critical" },
      { id: "sped-02", name: "IEP (Individualized Education Program) Process", description: "How IEPs are developed, implemented, and reviewed", priority: "critical" },
      { id: "sped-03", name: "504 Plan Information", description: "Section 504 accommodation plans and eligibility", priority: "critical" },
      { id: "sped-04", name: "Child Find / Referral Procedures", description: "How to refer a student for special education evaluation", priority: "critical" },
      { id: "sped-05", name: "Response to Intervention (RTI / MTSS)", description: "Multi-tiered support system for struggling students", priority: "recommended" },
      { id: "sped-06", name: "Related Services Info (Speech, OT, PT)", description: "Available therapeutic and related services", priority: "recommended" },
      { id: "sped-07", name: "Transition Planning (Post-Secondary)", description: "Planning for life after high school for special ed students", priority: "recommended" },
      { id: "sped-08", name: "Procedural Safeguards / Parent Rights (IDEA)", description: "Legal rights of parents under IDEA", priority: "critical" },
      { id: "sped-09", name: "ESL / ELL / Bilingual Program Info", description: "Services for English Language Learners", priority: "critical" },
      { id: "sped-10", name: "Dyslexia Screening & Services", description: "Screening procedures and support for students with dyslexia", priority: "recommended" },
      { id: "sped-11", name: "Assistive Technology Resources", description: "Technology tools available for students with disabilities", priority: "nice-to-have" },
      { id: "sped-12", name: "Homebound / Hospital Instruction Info", description: "Services for students unable to attend school", priority: "recommended" },
    ],
  },

  // ─────────────────────────────────────────────
  // 7. HEALTH & WELLNESS
  // ─────────────────────────────────────────────
  {
    id: "health",
    name: "Health & Wellness",
    items: [
      { id: "hlt-01", name: "Immunization Requirements", description: "Required vaccinations and exemption procedures", priority: "critical" },
      { id: "hlt-02", name: "Health Screening Schedule", description: "Vision, hearing, scoliosis, and other health screenings", priority: "recommended" },
      { id: "hlt-03", name: "Medication Administration Policy", description: "How prescription and OTC medications are handled at school", priority: "critical" },
      { id: "hlt-04", name: "Allergy Management Policy", description: "Procedures for managing student allergies including food allergies", priority: "critical" },
      { id: "hlt-05", name: "Epi-Pen / Anaphylaxis Action Plan", description: "Emergency protocols for severe allergic reactions", priority: "critical" },
      { id: "hlt-06", name: "Asthma Action Plan Info", description: "Management protocols for students with asthma", priority: "recommended" },
      { id: "hlt-07", name: "Diabetes Management Plan", description: "Protocols for managing students with diabetes", priority: "recommended" },
      { id: "hlt-08", name: "Seizure Action Plan", description: "Protocols for students with seizure disorders", priority: "recommended" },
      { id: "hlt-09", name: "School Nurse / Clinic Info", description: "Nurse availability, clinic hours, and procedures", priority: "critical" },
      { id: "hlt-10", name: "When to Keep Your Child Home (Illness Guidelines)", description: "Guidelines for when a sick child should stay home", priority: "critical" },
      { id: "hlt-11", name: "Communicable Disease Policy", description: "Handling of lice, flu, COVID, and other communicable diseases", priority: "critical" },
      { id: "hlt-12", name: "Head Lice Policy", description: "Specific procedures for head lice detection and treatment", priority: "recommended" },
      { id: "hlt-13", name: "Concussion Protocol", description: "Recognition, response, and return-to-play/learn procedures", priority: "critical" },
      { id: "hlt-14", name: "Mental Health Resources & Services", description: "Available counseling, crisis resources, and mental health support", priority: "critical" },
      { id: "hlt-15", name: "Suicide Prevention Policy & Resources", description: "Prevention protocols and crisis intervention resources", priority: "critical" },
      { id: "hlt-16", name: "Student Wellness Policy", description: "Comprehensive policy on nutrition, physical activity, and wellness", priority: "recommended" },
      { id: "hlt-17", name: "Physical Fitness Requirements", description: "PE requirements and physical fitness testing info", priority: "recommended" },
      { id: "hlt-18", name: "Health Insurance / Medicaid Info", description: "Information on available health coverage for students", priority: "nice-to-have" },
      { id: "hlt-19", name: "DNR / Medical Emergency Preferences", description: "How families can communicate critical medical preferences", priority: "nice-to-have" },
    ],
  },

  // ─────────────────────────────────────────────
  // 8. SAFETY & EMERGENCY
  // ─────────────────────────────────────────────
  {
    id: "safety",
    name: "Safety & Emergency Management",
    items: [
      { id: "saf-01", name: "Emergency Operations / Crisis Plan", description: "Comprehensive emergency response procedures", priority: "critical" },
      { id: "saf-02", name: "Fire Drill Procedures", description: "Fire evacuation routes and drill schedule", priority: "critical" },
      { id: "saf-03", name: "Lockdown / Active Shooter Procedures", description: "Lockdown protocols for armed intruder situations", priority: "critical" },
      { id: "saf-04", name: "Severe Weather / Tornado Procedures", description: "Shelter-in-place procedures for severe weather", priority: "critical" },
      { id: "saf-05", name: "Earthquake Procedures", description: "Drop-cover-hold and evacuation procedures for earthquakes", priority: "recommended" },
      { id: "saf-06", name: "Evacuation Plan & Routes", description: "Building evacuation maps and assembly points", priority: "critical" },
      { id: "saf-07", name: "Reunification Procedures", description: "How students are reunified with families after an emergency", priority: "critical" },
      { id: "saf-08", name: "Crisis Communication Plan", description: "How the school communicates during emergencies", priority: "critical" },
      { id: "saf-09", name: "Accident / Incident Reporting Procedures", description: "How accidents and injuries are documented and reported", priority: "critical" },
      { id: "saf-10", name: "School Safety Team / Committee Info", description: "Who is on the safety team and their roles", priority: "recommended" },
      { id: "saf-11", name: "Threat Assessment Procedures", description: "How threats to school safety are evaluated and managed", priority: "critical" },
      { id: "saf-12", name: "Shelter-in-Place Procedures", description: "Procedures for chemical, biological, or hazmat events", priority: "recommended" },
      { id: "saf-13", name: "AED / CPR Availability", description: "Location of AEDs and trained staff availability", priority: "recommended" },
      { id: "saf-14", name: "Campus Security Info", description: "Security personnel, cameras, access control details", priority: "recommended" },
      { id: "saf-15", name: "Sex Offender Notification Procedures", description: "How the school handles registered sex offender notifications", priority: "recommended" },
      { id: "saf-16", name: "Pandemic / Infectious Disease Response Plan", description: "Protocols for school operations during pandemics", priority: "critical" },
      { id: "saf-17", name: "Bomb Threat Procedures", description: "Procedures for responding to bomb threats", priority: "recommended" },
      { id: "saf-18", name: "Utility Failure Procedures", description: "Procedures for power outages, water main breaks, gas leaks", priority: "nice-to-have" },
    ],
  },

  // ─────────────────────────────────────────────
  // 9. TRANSPORTATION
  // ─────────────────────────────────────────────
  {
    id: "transportation",
    name: "Transportation",
    items: [
      { id: "trn-01", name: "Bus Routes & Schedules", description: "Route maps, stop locations, and pickup/dropoff times", priority: "critical" },
      { id: "trn-02", name: "Bus Rules & Behavior Expectations", description: "Student conduct expectations while on school transportation", priority: "critical" },
      { id: "trn-03", name: "Bus Registration / Eligibility", description: "How to sign up for bus service and who qualifies", priority: "critical" },
      { id: "trn-04", name: "Transportation Change Procedures", description: "How to request changes to bus stops or routes", priority: "recommended" },
      { id: "trn-05", name: "Car Rider / Drop-Off / Pick-Up Procedures", description: "Traffic flow, designated areas, and procedures for car riders", priority: "critical" },
      { id: "trn-06", name: "Student Driver / Parking Policy", description: "Rules for student drivers and parking permits", priority: "recommended" },
      { id: "trn-07", name: "Walking / Biking to School Policy", description: "Safe routes, bike rack info, and walking policies", priority: "nice-to-have" },
      { id: "trn-08", name: "Late Bus / After-School Transportation", description: "Transportation for after-school activities and late dismissal", priority: "nice-to-have" },
      { id: "trn-09", name: "Inclement Weather Transportation", description: "How transportation is affected by weather delays/cancellations", priority: "recommended" },
      { id: "trn-10", name: "Field Trip Transportation Policies", description: "How students are transported for field trips", priority: "recommended" },
      { id: "trn-11", name: "Special Needs Transportation", description: "Transportation services for students with disabilities", priority: "critical" },
    ],
  },

  // ─────────────────────────────────────────────
  // 10. FOOD & NUTRITION
  // ─────────────────────────────────────────────
  {
    id: "nutrition",
    name: "Food & Nutrition Services",
    items: [
      { id: "nut-01", name: "Lunch / Cafeteria Menu", description: "Daily/weekly menu with nutritional information", priority: "critical" },
      { id: "nut-02", name: "Free & Reduced Lunch Program Info", description: "Eligibility and application for meal assistance", priority: "critical" },
      { id: "nut-03", name: "Meal Prices", description: "Cost of breakfast, lunch, and a la carte items", priority: "critical" },
      { id: "nut-04", name: "Meal Payment / Account System", description: "How to add funds, online payment options, and low-balance alerts", priority: "recommended" },
      { id: "nut-05", name: "Food Allergy Accommodations", description: "How the cafeteria handles food allergies and special diets", priority: "critical" },
      { id: "nut-06", name: "Breakfast Program Info", description: "Availability and details of school breakfast program", priority: "recommended" },
      { id: "nut-07", name: "Snack / Vending Machine Policy", description: "Rules for snacks, vending machines, and food brought from home", priority: "nice-to-have" },
      { id: "nut-08", name: "Classroom Celebration / Birthday Treat Policy", description: "Rules for food at parties and celebrations", priority: "nice-to-have" },
      { id: "nut-09", name: "Nutrition / Wellness Standards", description: "Nutritional standards for all food sold or served at school", priority: "recommended" },
    ],
  },

  // ─────────────────────────────────────────────
  // 11. TECHNOLOGY
  // ─────────────────────────────────────────────
  {
    id: "technology",
    name: "Technology",
    items: [
      { id: "tech-01", name: "1:1 Device Program Info", description: "Details about school-issued devices (Chromebook, iPad, etc.)", priority: "recommended" },
      { id: "tech-02", name: "Device Acceptable Use Agreement", description: "Terms of use for school-provided technology", priority: "critical" },
      { id: "tech-03", name: "Device Care & Responsibility Policy", description: "How students should care for devices, damage/loss fees", priority: "recommended" },
      { id: "tech-04", name: "Internet Safety / Digital Citizenship", description: "Education on safe and responsible internet use", priority: "critical" },
      { id: "tech-05", name: "Content Filtering / Monitoring Info", description: "What internet filtering is in place and monitoring practices", priority: "recommended" },
      { id: "tech-06", name: "Student Data Privacy Policy", description: "How student data is collected, stored, and protected", priority: "critical" },
      { id: "tech-07", name: "COPPA / CIPA Compliance Info", description: "Compliance with children's privacy and internet protection acts", priority: "critical" },
      { id: "tech-08", name: "Software / App List (Approved)", description: "List of approved educational software and apps used", priority: "recommended" },
      { id: "tech-09", name: "Tech Support / Help Desk Info", description: "How students and parents can get tech support", priority: "recommended" },
      { id: "tech-10", name: "Wi-Fi Access Info", description: "Guest and student Wi-Fi access information", priority: "nice-to-have" },
      { id: "tech-11", name: "AI / ChatGPT Usage Policy", description: "Policy on student use of AI tools for assignments", priority: "recommended" },
      { id: "tech-12", name: "Social Media Policy (School Accounts)", description: "How the school uses social media and parent consent", priority: "nice-to-have" },
    ],
  },

  // ─────────────────────────────────────────────
  // 12. LEGAL & COMPLIANCE
  // ─────────────────────────────────────────────
  {
    id: "legal",
    name: "Legal & Compliance",
    items: [
      { id: "leg-01", name: "Non-Discrimination / Equal Opportunity Policy", description: "Commitment to non-discrimination in all programs", priority: "critical" },
      { id: "leg-02", name: "Title IX Policy & Coordinator Info", description: "Gender equity policies and Title IX reporting", priority: "critical" },
      { id: "leg-03", name: "Title VI / Civil Rights Compliance", description: "Compliance with civil rights requirements", priority: "critical" },
      { id: "leg-04", name: "ADA / Section 504 Compliance", description: "Policies ensuring accessibility for individuals with disabilities", priority: "critical" },
      { id: "leg-05", name: "FERPA (Student Records Privacy)", description: "Family Educational Rights and Privacy Act information", priority: "critical" },
      { id: "leg-06", name: "Directory Information Opt-Out", description: "How parents can opt out of directory information sharing", priority: "critical" },
      { id: "leg-07", name: "McKinney-Vento (Homeless Students) Info", description: "Rights and services for students experiencing homelessness", priority: "critical" },
      { id: "leg-08", name: "Foster Care Student Protections", description: "Educational stability rights for students in foster care", priority: "recommended" },
      { id: "leg-09", name: "Military Family Support Info", description: "Resources and protections for military-connected students", priority: "nice-to-have" },
      { id: "leg-10", name: "Mandatory Reporting (Child Abuse) Info", description: "How the school handles suspected child abuse/neglect reporting", priority: "critical" },
      { id: "leg-11", name: "Student Records Request Procedures", description: "How parents can access and request student records", priority: "recommended" },
      { id: "leg-12", name: "Photo / Media Release & Consent", description: "Permission forms for student photos, video, and media use", priority: "recommended" },
      { id: "leg-13", name: "Asbestos / Environmental Hazard Notices", description: "AHERA and environmental safety notifications", priority: "recommended" },
      { id: "leg-14", name: "Pesticide Application Notification", description: "Notice of pesticide use on school grounds", priority: "nice-to-have" },
      { id: "leg-15", name: "Annual FERPA / Rights Notification", description: "Annual notice of parent and student rights under FERPA", priority: "critical" },
      { id: "leg-16", name: "Complaint / Grievance Procedures (General)", description: "How parents and community members can file formal complaints", priority: "recommended" },
      { id: "leg-17", name: "Sexual Harassment Policy", description: "Prohibition of sexual harassment and reporting procedures", priority: "critical" },
    ],
  },

  // ─────────────────────────────────────────────
  // 13. EXTRACURRICULAR & ATHLETICS
  // ─────────────────────────────────────────────
  {
    id: "extracurricular",
    name: "Extracurricular & Athletics",
    items: [
      { id: "ext-01", name: "Extracurricular Activities List", description: "Available clubs, organizations, and activities", priority: "recommended" },
      { id: "ext-02", name: "Club / Activity Participation Requirements", description: "Eligibility requirements and sign-up process", priority: "recommended" },
      { id: "ext-03", name: "Athletic Programs Overview", description: "Available sports by season and grade level", priority: "recommended" },
      { id: "ext-04", name: "Athletic Eligibility Requirements", description: "Academic, physical, and behavioral requirements for sports", priority: "recommended" },
      { id: "ext-05", name: "Sports Physical / Pre-Participation Form", description: "Required medical clearance for athletes", priority: "critical" },
      { id: "ext-06", name: "Athletic Code of Conduct", description: "Behavioral expectations for student-athletes", priority: "recommended" },
      { id: "ext-07", name: "Sportsmanship Policy", description: "Expectations for athletes, coaches, and spectators", priority: "nice-to-have" },
      { id: "ext-08", name: "Athletic Injury / Concussion Return-to-Play", description: "Protocols for returning to play after injury", priority: "critical" },
      { id: "ext-09", name: "Athletic Fee Information", description: "Costs associated with sports participation", priority: "recommended" },
      { id: "ext-10", name: "Field Trip Permission Form / Policy", description: "General field trip permission and procedures", priority: "critical" },
      { id: "ext-11", name: "Overnight Trip / Travel Policy", description: "Policies for overnight or long-distance school trips", priority: "recommended" },
      { id: "ext-12", name: "Volunteer / Chaperone Requirements", description: "Background check and training requirements for volunteers", priority: "recommended" },
      { id: "ext-13", name: "Fundraising Policy", description: "Rules and approval process for fundraising activities", priority: "nice-to-have" },
      { id: "ext-14", name: "Before / After School Programs", description: "Available programs, hours, costs, and registration", priority: "critical" },
      { id: "ext-15", name: "Summer Programs / Camp Info", description: "Summer enrichment, sports camps, and programs", priority: "nice-to-have" },
    ],
  },

  // ─────────────────────────────────────────────
  // 14. COUNSELING & SUPPORT
  // ─────────────────────────────────────────────
  {
    id: "counseling",
    name: "Counseling & Support Services",
    items: [
      { id: "cns-01", name: "School Counseling Services Overview", description: "Available counseling services and how to access them", priority: "critical" },
      { id: "cns-02", name: "College & Career Counseling Info", description: "Resources for college prep, career exploration, and planning", priority: "recommended" },
      { id: "cns-03", name: "College Application / Financial Aid Resources", description: "Help with applications, FAFSA, and scholarships", priority: "recommended" },
      { id: "cns-04", name: "Crisis Intervention Resources", description: "Emergency mental health resources and hotline numbers", priority: "critical" },
      { id: "cns-05", name: "Substance Abuse Resources", description: "Prevention programs and resources for students and families", priority: "recommended" },
      { id: "cns-06", name: "Grief / Bereavement Support", description: "Resources for students dealing with loss", priority: "recommended" },
      { id: "cns-07", name: "Anti-Vaping / Tobacco Prevention", description: "Education and prevention programs for vaping and tobacco", priority: "recommended" },
      { id: "cns-08", name: "Peer Mediation / Conflict Resolution", description: "Programs for student-led conflict resolution", priority: "nice-to-have" },
      { id: "cns-09", name: "Character Education Program", description: "Programs promoting character development and values", priority: "nice-to-have" },
      { id: "cns-10", name: "Social-Emotional Learning (SEL) Info", description: "SEL curriculum and approach used at the school", priority: "recommended" },
      { id: "cns-11", name: "Student Assistance Program (SAP)", description: "Early intervention team and referral process", priority: "recommended" },
      { id: "cns-12", name: "Community Resource Referrals", description: "External resources for families (food banks, housing, counseling)", priority: "recommended" },
    ],
  },

  // ─────────────────────────────────────────────
  // 15. COMMUNICATION & PARENT ENGAGEMENT
  // ─────────────────────────────────────────────
  {
    id: "communication",
    name: "Communication & Parent Engagement",
    items: [
      { id: "com-01", name: "Communication Channels & Methods", description: "How the school communicates (app, email, text, website, etc.)", priority: "critical" },
      { id: "com-02", name: "Parent Portal / SIS Access Guide", description: "How to access the student information system and what's available", priority: "critical" },
      { id: "com-03", name: "Teacher Contact / Communication Policy", description: "How and when parents can contact teachers", priority: "recommended" },
      { id: "com-04", name: "Newsletter / Bulletin Info", description: "School newsletter schedule and how to access it", priority: "nice-to-have" },
      { id: "com-05", name: "School Website Guide", description: "Overview of what's available on the school website", priority: "nice-to-have" },
      { id: "com-06", name: "Language / Translation Services", description: "Available translation and interpretation services", priority: "critical" },
      { id: "com-07", name: "Family Engagement Policy / Plan", description: "How the school involves families in education", priority: "recommended" },
      { id: "com-08", name: "School-Home Compact", description: "Agreement between school, parents, and students on shared responsibilities", priority: "recommended" },
      { id: "com-09", name: "Emergency Communication System Info", description: "How the school sends emergency alerts to families", priority: "critical" },
      { id: "com-10", name: "Social Media Channels (Official)", description: "Links to official school social media accounts", priority: "nice-to-have" },
    ],
  },

  // ─────────────────────────────────────────────
  // 16. FACILITIES & OPERATIONS
  // ─────────────────────────────────────────────
  {
    id: "facilities",
    name: "Facilities & Operations",
    items: [
      { id: "fac-01", name: "Campus Map / Building Layout", description: "Map of school grounds, buildings, and key locations", priority: "recommended" },
      { id: "fac-02", name: "Facility Use / Rental Policy", description: "How community members can rent school facilities", priority: "nice-to-have" },
      { id: "fac-03", name: "Playground Rules & Safety", description: "Rules and supervision expectations for playground use", priority: "recommended" },
      { id: "fac-04", name: "Indoor Air Quality Info", description: "Information on air quality and ventilation systems", priority: "nice-to-have" },
      { id: "fac-05", name: "Water Quality / Lead Testing Results", description: "Results of water quality testing in school buildings", priority: "recommended" },
      { id: "fac-06", name: "Integrated Pest Management (IPM) Plan", description: "How pests are managed on school property", priority: "nice-to-have" },
      { id: "fac-07", name: "Green / Sustainability Initiatives", description: "Environmental sustainability programs at the school", priority: "nice-to-have" },
      { id: "fac-08", name: "School Supply List (by Grade)", description: "Required supplies for each grade level", priority: "critical" },
    ],
  },

  // ─────────────────────────────────────────────
  // 17. FINANCE & FEES
  // ─────────────────────────────────────────────
  {
    id: "finance",
    name: "Finance & Fees",
    items: [
      { id: "fin-01", name: "Fee Schedule (Comprehensive)", description: "All fees including registration, activity, technology, lab, etc.", priority: "critical" },
      { id: "fin-02", name: "Fee Waiver / Reduction Policy", description: "How families can apply for fee waivers", priority: "critical" },
      { id: "fin-03", name: "Payment Plans & Options", description: "Available payment plans for tuition and fees", priority: "recommended" },
      { id: "fin-04", name: "Refund Policy", description: "Conditions and procedures for refunds", priority: "recommended" },
      { id: "fin-05", name: "Budget Overview / Financial Transparency", description: "Public-facing budget information", priority: "nice-to-have" },
      { id: "fin-06", name: "Donation / Gift Policy", description: "How to make donations and how they are used", priority: "nice-to-have" },
    ],
  },

  // ─────────────────────────────────────────────
  // 18. HUMAN RESOURCES & STAFFING
  // ─────────────────────────────────────────────
  {
    id: "hr",
    name: "Human Resources & Staffing",
    items: [
      { id: "hr-01", name: "Employment Opportunities / Job Postings", description: "Current openings and how to apply", priority: "recommended" },
      { id: "hr-02", name: "Substitute Teacher Info", description: "Information for substitute teachers and how to sign up", priority: "nice-to-have" },
      { id: "hr-03", name: "Staff Qualifications / Credentials", description: "Information about teacher certifications and qualifications", priority: "recommended" },
      { id: "hr-04", name: "Background Check Policy", description: "Background check requirements for staff and volunteers", priority: "critical" },
      { id: "hr-05", name: "Employee Handbook", description: "Comprehensive staff policies and procedures", priority: "recommended" },
      { id: "hr-06", name: "Staff Code of Conduct / Ethics", description: "Professional conduct expectations for all staff", priority: "critical" },
      { id: "hr-07", name: "Staff Social Media Policy", description: "Guidelines for staff use of social media", priority: "recommended" },
      { id: "hr-08", name: "Professional Development Plan", description: "Staff training and professional growth opportunities", priority: "nice-to-have" },
      { id: "hr-09", name: "Whistleblower / Reporting Policy", description: "How staff can report misconduct or safety concerns", priority: "recommended" },
    ],
  },

  // ─────────────────────────────────────────────
  // 19. EQUITY, DIVERSITY & INCLUSION
  // ─────────────────────────────────────────────
  {
    id: "equity",
    name: "Equity, Diversity & Inclusion",
    items: [
      { id: "edi-01", name: "Equity & Inclusion Policy", description: "School commitment to equity, diversity, and inclusion", priority: "recommended" },
      { id: "edi-02", name: "Anti-Racism / Cultural Competency Plan", description: "Initiatives to promote anti-racism and cultural awareness", priority: "recommended" },
      { id: "edi-03", name: "LGBTQ+ Student Support & Policies", description: "Policies protecting LGBTQ+ students and available resources", priority: "recommended" },
      { id: "edi-04", name: "Gender Identity / Transgender Student Policy", description: "Policies on name/pronoun use, restrooms, and inclusion", priority: "recommended" },
      { id: "edi-05", name: "Religious Accommodations Policy", description: "How religious observances and needs are accommodated", priority: "recommended" },
      { id: "edi-06", name: "Multicultural Education Initiatives", description: "Programs celebrating diversity and multicultural education", priority: "nice-to-have" },
    ],
  },

  // ─────────────────────────────────────────────
  // 20. FORMS & DOCUMENTS
  // ─────────────────────────────────────────────
  {
    id: "forms",
    name: "Common Forms & Documents",
    items: [
      { id: "frm-01", name: "Emergency Contact / Medical Info Form", description: "Form for emergency contacts and medical information", priority: "critical" },
      { id: "frm-02", name: "Media / Photo Release Form", description: "Consent form for student photos and media", priority: "recommended" },
      { id: "frm-03", name: "Field Trip Permission Form (General)", description: "Standard permission slip for field trips", priority: "critical" },
      { id: "frm-04", name: "Technology Acceptable Use Agreement Form", description: "Signed agreement for technology use", priority: "critical" },
      { id: "frm-05", name: "Student Health History Form", description: "Comprehensive health history for school records", priority: "critical" },
      { id: "frm-06", name: "Medication Authorization Form", description: "Authorization for school to administer medication", priority: "critical" },
      { id: "frm-07", name: "Student Pickup Authorization Form", description: "Authorized persons for student pickup", priority: "critical" },
      { id: "frm-08", name: "Early Dismissal / Late Arrival Form", description: "Form for requesting early dismissal or late arrival", priority: "recommended" },
      { id: "frm-09", name: "Address / Contact Change Form", description: "Form to update contact information", priority: "recommended" },
      { id: "frm-10", name: "Volunteer Application Form", description: "Application and agreement for school volunteers", priority: "recommended" },
      { id: "frm-11", name: "Handbook Acknowledgement Form", description: "Form confirming receipt and review of the student handbook", priority: "recommended" },
      { id: "frm-12", name: "Absence Excuse / Doctor Note Form", description: "Form for documenting excused absences", priority: "recommended" },
    ],
  },
];

// Precomputed stats
export const TOTAL_CHECKLIST_ITEMS = SCHOOL_CHECKLIST.reduce(
  (sum, cat) => sum + cat.items.length,
  0
);

export const CHECKLIST_BY_ID = new Map<string, ChecklistItem & { categoryId: string; categoryName: string }>();
for (const cat of SCHOOL_CHECKLIST) {
  for (const item of cat.items) {
    CHECKLIST_BY_ID.set(item.id, { ...item, categoryId: cat.id, categoryName: cat.name });
  }
}
