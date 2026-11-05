# TCM Calendar

A web application that helps Tecnocampus students build their class timetable.
Students pick the subjects they want to take, set a few preferences, and the
app generates and ranks possible timetables based on the official group schedules.

Final degree project (TFG), 2025–26. The user interface is in Catalan.

## What it does

- **Subject catalogue.** On startup, the backend imports each degree's study plan
  and group timetables from the Excel files in `backend/src/main/resources/`.
  Supported degrees:
  - GEEIA – Enginyeria Electrònica Industrial i Automàtica
  - GEIGSI – Enginyeria Informàtica de Gestió i Sistemes d'Informació
  - GEM – Enginyeria Mecànica
  - GEOI – Enginyeria d'Organització Industrial
  - GEIGDP – Doble grau en Informàtica de Gestió i Sistemes d'Informació i Disseny i Producció de Videojocs
  - GEEIA+GEM and GEEIA+GEIGSI (simultaneous degrees, built from the base degrees' files)
- **Timetable generation.** A backtracking search tries the group options of every
  selected subject for a given trimester. Results are ranked by:
  1. number of clashes,
  2. minutes of overlap,
  3. a score for the chosen optimisation goal: `minimize-gaps`, `free-day`,
     `balanced`, `avoid-early`, `avoid-late` or `group-by-type`.

  The search stops after an exploration limit. If no clash-free combination
  exists, it still returns the best options it found, with a message
  describing the clashes.
- **Viewing and exporting.** Generated timetables can be viewed in the browser,
  exported as PDF or `.ics` (calendar file), and saved in the browser's
  `localStorage`.
- **Academic calendar.** Trimester and exam dates are served from
  `Calendario_Academico.txt`.
- **Accounts.** Sign in with Google (OAuth2) or with email and password. Both are
  restricted to `@edu.tecnocampus.cat` addresses. The backend issues a JWT. A
  user profile stores name, degree, academic year, avatar, preferred
  optimisation and selected subjects. Password-reset links are sent by email over SMTP.

## Stack

| Part | Technology |
|---|---|
| Backend | Java 17, Spring Boot 3.5 (Web, Data JPA, Security, OAuth2 Client, Mail, Validation) |
| Auth | Google OAuth2 login, JWT (jjwt 0.11.5, HS256) |
| Database | H2, file-based (`backend/data/`, created on first run) |
| Excel import | Apache POI 5.2.5 |
| Build | Maven (wrapper included: `mvnw` / `mvnw.cmd`) |
| Frontend | Plain HTML, CSS and JavaScript with no build step; PDF export loads html2pdf.js from a CDN |

## Project layout

```
backend/    Spring Boot API (port 8080)
  src/main/java/com/tecnocampus/backend/
    registration/   users, profiles, login, JWT, OAuth2, password reset
    subjects/       subject catalogue and Excel import
    timetables/     timetable generation and academic calendar
    shared/         degree → resource-file mapping
  src/main/resources/
    application.properties.example
    *.xlsx, Calendario_Academico.txt
frontend/   static pages, scripts and styles
```

## Configuration

The real configuration file is not in the repository. Create it from the example:

```bash
cd backend/src/main/resources
cp application.properties.example application.properties
```

Secret values are read from five environment variables:

| Variable | What it is |
|---|---|
| `JWT_SECRET_KEY` | Base64-encoded key of at least 32 bytes, used to sign JWTs. Generate one with `openssl rand -base64 32`. |
| `GOOGLE_CLIENT_ID` | OAuth 2.0 client ID from Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | The matching client secret. |
| `MAIL_USERNAME` | Gmail account used to send password-reset emails (SMTP host is `smtp.gmail.com:587`). |
| `MAIL_PASSWORD` | An app password for that account. |

In the Google OAuth client, add this authorised redirect URI:
`http://localhost:8080/login/oauth2/code/google`

The app won't start (and `mvnw package` won't pass its test) unless
`application.properties` exists and all five variables are set. You can use
dummy values for Google and mail if you don't need those features locally.

## Running locally

Requires JDK 17 or newer.

**1. Backend** (from `backend/`):

```bash
# bash
export JWT_SECRET_KEY="$(openssl rand -base64 32)"
export GOOGLE_CLIENT_ID=...  GOOGLE_CLIENT_SECRET=...
export MAIL_USERNAME=...     MAIL_PASSWORD=...
./mvnw spring-boot:run
```

```powershell
# PowerShell
$env:JWT_SECRET_KEY = "<base64 key>"
$env:GOOGLE_CLIENT_ID = "..."; $env:GOOGLE_CLIENT_SECRET = "..."
$env:MAIL_USERNAME = "...";    $env:MAIL_PASSWORD = "..."
.\mvnw.cmd spring-boot:run
```

The API listens on `http://localhost:8080`. You can check it with
`http://localhost:8080/api/subjects/test`. The H2 console is at
`http://localhost:8080/h2-console` (JDBC URL `jdbc:h2:file:./data/testdb`,
user `sa`, empty password).

**2. Frontend.** Serve the `frontend/` folder as static files on
`http://127.0.0.1:5500`, for example:

```bash
cd frontend
python -m http.server 5500 --bind 127.0.0.1
```

Then open `http://127.0.0.1:5500/index.html`.

Use port 5500 because the backend's CORS settings, the post-login redirect
(`app.frontend.url`) and the password-reset link expect the frontend there.
The frontend scripts call the backend at `http://localhost:8080`.

## Tests

```bash
cd backend
./mvnw test
```

The test suite has one Spring context-load test. It needs the same
configuration as running the app.
