# 🏢 Hall Management & Reservation Tracking System

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/.NET-7.0-512BD4?logo=dotnet&logoColor=white" />
  <img src="https://img.shields.io/badge/Microsoft_SQL_Server-CC2927?logo=microsoftsqlserver&logoColor=white" />
</p>

<p align="center">
  <strong>Centralized Hall Reservation and Management Platform</strong>
</p>

<p align="center">
  A web-based management system for managing centers, halls, hall features, reservations, and scheduling conflicts from a single platform.
</p>

<p align="center">
  🌐 Live Demo: https://salontakipsistemi.maind.com.tr/
</p>

---

## Overview

Hall Management & Reservation Tracking System is a modern web application designed to manage halls distributed across multiple centers and efficiently track reservation activities.

The system allows administrators to create and manage centers, define halls and their characteristics, register reservations, monitor hall availability, and automatically detect scheduling conflicts.

Built with a modern frontend architecture using Next.js and a robust .NET backend, the platform provides a centralized solution for hall management and reservation tracking.

---

## Key Features

### 🏢 Center Management

- Create, update, and manage centers
- Organize halls under specific centers
- Center-based filtering and management

### 🏛️ Hall Management

- Create and update halls
- Assign halls to centers
- Define hall specifications and attributes
- Maintain hall information from a centralized dashboard

### 📅 Reservation Management

- Create reservation records
- Update reservation information
- Track reservation history
- View reservations by hall and center

### ⚠️ Conflict Detection

- Automatic reservation conflict validation
- Prevent overlapping bookings
- Date and time availability checks
- Real-time scheduling control

### 📊 Administrative Dashboard

- Centralized management interface
- Reservation tracking and monitoring
- Responsive user experience
- Fast and intuitive workflow

---

## Technology Stack

### Frontend

- Next.js 16
- React 19
- TypeScript
- App Router

### Backend

- .NET 7+
- ASP.NET Core Web API

### Database

- Microsoft SQL Server

### Deployment

- Plesk
- Node.js Runtime

---

## Architecture

```text
Frontend (Next.js)
        │
        ▼
REST API (.NET)
        │
        ▼
Business Logic Layer
        │
        ▼
Microsoft SQL Server
```

---

## Project Structure

```text
hall-management-system/
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── public/
│   └── package.json
│
├── backend/
│   ├── Controllers/
│   ├── Services/
│   ├── Models/
│   ├── Data/
│   └── Program.cs
│
└── README.md
```

---

## Installation

### Prerequisites

- Node.js 20+
- .NET SDK 7.0+
- Microsoft SQL Server

---

### Frontend Setup

Install dependencies:

```bash
npm install
```

Create a `.env.local` file:

```env
NEXT_PUBLIC_API_URL=http://localhost:5230
```

Start the development server:

```bash
npm run dev
```

Frontend will be available at:

```text
http://localhost:3000
```

---

### Backend Setup

Navigate to the backend project:

```bash
cd ../hall-management-api
```

Run the API:

```bash
dotnet run
```

Backend will be available at:

```text
http://localhost:5230
```

---

## Environment Variables

| Variable | Description |
|-----------|-------------|
| NEXT_PUBLIC_API_URL | Backend API base URL |

Example:

```env
NEXT_PUBLIC_API_URL=http://localhost:5230
```

---

## Production Build

Build the application:

```bash
npm run build
```

Run production server:

```bash
npm start
```

---

## Use Cases

- Hall reservation management
- Multi-center hall administration
- Scheduling and availability tracking
- Reservation conflict prevention
- Centralized operational management
- Event and booking organization

---

## Future Improvements

- Calendar-based reservation view
- Role-based authorization system
- Reservation status workflows
- Reporting and analytics dashboard
- Notification system
- Multi-user management
- Advanced search and filtering

---

## Live Application

https://salontakipsistemi.maind.com.tr/

---
