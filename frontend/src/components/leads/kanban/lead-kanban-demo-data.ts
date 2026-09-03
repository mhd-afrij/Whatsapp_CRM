/**
 * Demo data for the healthcare lead-kanban design preview (/lead-kanban).
 * Dates are generated relative to "now" so the relative labels the card shows
 * ("Today · 10:30 AM", "2 days old", "Tomorrow · 9:00 AM") always look right,
 * no matter when the preview is opened.
 */

import type { LeadKanbanLead } from "@/components/leads/kanban/lead-kanban-types";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Date `hours` ago (exact clock time preserved). */
function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * HOUR);
}

/** Today at a fixed local clock time. */
function todayAt(hour: number, minute = 0): Date {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
}

/** `days` ago at a fixed local clock time. */
function daysAgoAt(days: number, hour: number, minute = 0): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

/** `days` from now at a fixed local clock time. */
function inDaysAt(days: number, hour: number, minute = 0): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

export function createDemoLeads(): LeadKanbanLead[] {
  return [
    /* ------------------------------- NEW LEADS ------------------------------ */
    {
      id: "demo-1",
      stage: "new",
      patientName: "Sanduni Rathnayake",
      phone: "077 234 8891",
      location: "Colombo 07",
      service: "Dental Consultation",
      priority: "high",
      status: "new",
      unreadCount: 3,
      lastMessage:
        "Hi, do you have an appointment for a root canal this week? My tooth has been hurting for two days now.",
      assignedStaff: { name: "Kasun", role: "Reception" },
      lastContact: hoursAgo(0.5),
      createdAt: hoursAgo(5),
    },
    {
      id: "demo-2",
      stage: "new",
      patientName: "Isuru Bandara",
      phone: "071 882 4410",
      location: "Kandy",
      service: "Full Body Medical Checkup",
      priority: "medium",
      status: "new",
      lastMessage:
        "Need a full body checkup before my insurance renews at the end of the month. What packages do you have?",
      assignedStaff: null,
      lastContact: hoursAgo(2),
      createdAt: daysAgoAt(1, 9, 40),
    },

    /* -------------------------------- CONTACTED ------------------------------ */
    {
      id: "demo-3",
      stage: "contacted",
      patientName: "Nimal Perera",
      phone: "077 123 4567",
      location: "Colombo 03",
      service: "Dental Consultation",
      priority: "high",
      status: "contacted",
      unreadCount: 2,
      lastMessage:
        "My dentist referred me here - is Dr. Silva free on Friday morning for a second opinion?",
      assignedStaff: { name: "Dr. Silva", role: "Dentist" },
      lastContact: hoursAgo(2.5),
      nextFollowUp: inDaysAt(1, 10, 30),
      createdAt: daysAgoAt(2, 14, 20),
    },
    {
      id: "demo-4",
      stage: "contacted",
      patientName: "Tharindu Wickramasinghe",
      phone: "075 556 7021",
      location: "Negombo",
      service: "Laboratory Blood Test",
      priority: "medium",
      status: "contacted",
      lastMessage:
        "Okay, I will come by tomorrow morning to give the blood sample. Please confirm if I need to fast before.",
      assignedStaff: { name: "Sachini", role: "Nurse" },
      lastContact: daysAgoAt(1, 18, 12),
      createdAt: daysAgoAt(3, 11, 5),
    },

    /* -------------------------- APPOINTMENT SCHEDULED ------------------------ */
    {
      id: "demo-5",
      stage: "appointment_scheduled",
      patientName: "Anjali Fernando",
      phone: "077 998 3321",
      location: "Galle",
      service: "Child Vaccination",
      priority: "high",
      status: "appointment",
      lastMessage:
        "We'll be there at 8:45. Please have the health records and the previous vaccination card ready.",
      assignedStaff: { name: "Dr. Perera", role: "Pediatrician" },
      lastContact: todayAt(8, 15),
      nextFollowUp: inDaysAt(1, 9, 0),
      reminder: true,
      createdAt: daysAgoAt(4, 16, 30),
    },
    {
      id: "demo-6",
      stage: "appointment_scheduled",
      patientName: "Kavindi Jayasuriya",
      phone: "071 448 9902",
      location: "Colombo 05",
      service: "Skin Consultation",
      priority: "medium",
      status: "appointment",
      lastMessage:
        "Confirmed for the acne treatment consultation. I sent the photos of the affected areas as you asked.",
      assignedStaff: { name: "Dr. Fernando", role: "Dermatologist" },
      lastContact: hoursAgo(4),
      nextFollowUp: inDaysAt(1, 15, 0),
      reminder: true,
      createdAt: hoursAgo(30),
    },

    /* ------------------------ CONSULTATION COMPLETED -------------------------- */
    {
      id: "demo-7",
      stage: "consultation_completed",
      patientName: "Ruwan Dias",
      phone: "076 210 8845",
      location: "Moratuwa",
      service: "Cardiology Review",
      priority: "medium",
      status: "consultation",
      lastMessage:
        "Thanks for the quick appointment - the doctor said the ECG and the blood pressure readings looked fine.",
      assignedStaff: { name: "Dr. Jayawardena", role: "Cardiologist" },
      lastContact: todayAt(13, 20),
      nextFollowUp: inDaysAt(30, 9, 30),
      createdAt: daysAgoAt(6, 10, 15),
    },

    /* -------------------------------- FOLLOW UP ------------------------------ */
    {
      id: "demo-8",
      stage: "follow_up",
      patientName: "Dinuka Herath",
      phone: "070 667 3358",
      location: "Dehiwala",
      service: "Physiotherapy Session",
      priority: "low",
      status: "follow_up",
      unreadCount: 1,
      lastMessage: "Just checking in - how is your knee feeling after the second session?",
      assignedStaff: { name: "Nuwan", role: "Physiotherapist" },
      lastContact: daysAgoAt(1, 17, 45),
      nextFollowUp: inDaysAt(1, 17, 0),
      createdAt: daysAgoAt(8, 12, 0),
    },

    /* -------------------------------- CONVERTED ------------------------------ */
    {
      id: "demo-9",
      stage: "converted",
      patientName: "Fathima Rizwan",
      phone: "077 391 1160",
      location: "Colombo 02",
      service: "Laboratory Blood Test",
      priority: "low",
      status: "converted",
      lastMessage: "Thank you - the report is ready for pickup, and the patient file is now active.",
      assignedStaff: { name: "Kasun", role: "Reception" },
      lastContact: daysAgoAt(3, 11, 30),
      createdAt: daysAgoAt(12, 9, 10),
    },
    {
      id: "demo-10",
      stage: "converted",
      patientName: "Chamari De Silva",
      phone: "072 554 9987",
      location: "Nugegoda",
      service: "Dental Implant Consultation",
      priority: "medium",
      status: "converted",
      lastMessage: "Treatment plan approved and the deposit is paid. See you at the fitting!",
      assignedStaff: { name: "Dr. Silva", role: "Dentist" },
      lastContact: daysAgoAt(5, 15, 40),
      nextFollowUp: "Next month · Implant fitting",
      createdAt: daysAgoAt(9, 10, 0),
    },
  ];
}
