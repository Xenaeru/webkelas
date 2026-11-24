# Kelas X RPL 1 — Sistem Informasi Kelas

Website informasi kelas dengan jadwal pelajaran yang **berganti otomatis setiap pukul 19.00 WIB**, daftar tugas, pengumuman, dan panel admin terlindungi autentikasi. Semua data disimpan permanen di database SQLite.

## Stack

| Lapisan | Teknologi |
|---|---|
| Framework | Next.js 15 (App Router) + React 19 |
| Bahasa | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL (Supabase saat deploy, PGlite untuk lokal/test) |
| Validasi | Zod |
| Auth | Session cookie httpOnly + hash password `scrypt` |
| Test | Vitest + Playwright (E2E/UI) |

Aplikasi memakai PostgreSQL di semua lingkungan. Kalau `DATABASE_URL` diisi, koneksi langsung ke server Postgres (Supabase). Kalau kosong, aplikasi memakai **PGlite** — PostgreSQL asli yang dikompilasi ke WASM dan disimpan di `.data/pglite` — sehingga `npm run dev` langsung jalan tanpa perlu install database apa pun. Dialek SQL-nya sama persis, jadi tidak ada kode yang berbeda antara lokal dan produksi.

## Menjalankan

```bash
npm install
npm run dev          # http://localhost:3000, database otomatis di .data/pglite
```

Produksi:

```bash
npm run build
npm start
```

Data demo (opsional, **bukan** data asli kelas):

```bash
npm run seed
```

Untuk memakai Postgres sungguhan saat pengembangan, salin `.env.example` menjadi `.env.local` lalu isi `DATABASE_URL`.

## Membuat akun admin pertama

Tidak ada kredensial yang di-hardcode. Akun pertama dibuat lewat halaman setup yang hanya aktif selama database belum punya admin:

1. Buka `/admin/login`.
2. Selama belum ada admin, halaman otomatis menampilkan form **"Buat akun admin pertama"**.
3. Isi username (min. 3 karakter) dan password (min. 8 karakter).
4. Setelah dibuat, halaman setup terkunci — permintaan setup berikutnya ditolak dengan `409`.

Alternatif lewat API:

```bash
curl -X POST http://localhost:3000/api/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password-kuat-anda"}'
```

Password disimpan sebagai `scrypt$<salt>$<hash>`, tidak pernah plaintext. Session berlaku 7 hari dan disimpan di tabel `admin_sessions` (bukan localStorage).

## Struktur halaman

| Route | Akses | Isi |
|---|---|---|
| `/` | Publik | Identitas kelas, jadwal aktif, preview tugas, pengumuman |
| `/jadwal` | Publik | Hari aktif + tanggal, tab Senin–Jumat, timeline jadwal, keterangan hari, daftar tugas |
| `/admin/login` | Publik | Login, atau setup admin pertama |
| `/admin` | Admin | Dashboard ringkasan + status jadwal per hari |
| `/admin/jadwal` | Admin | CRUD pelajaran untuk Jadwal A, B, atau Ujian (`?version=A|B|EXAM`) |
| `/admin/mode-jadwal` | Admin | Pilih mode tampil: otomatis, manual A/B, atau mode ujian |
| `/admin/tugas` | Admin | CRUD tugas, filter, tandai selesai |
| `/admin/pengaturan` | Admin | Nama kelas, deskripsi, wali kelas, tahun ajaran, pengumuman |

## Route API

| Method | Endpoint | Auth | Fungsi |
|---|---|---|---|
| `GET` | `/api/schedules?version=A\|B\|EXAM` | — | Semua jadwal versi itu + item |
| `POST` | `/api/schedules?day=N&action=item&version=…` | ✔ | Tambah pelajaran |
| `POST` | `/api/schedules?day=N&action=description&version=…` | ✔ | Simpan keterangan hari |
| `POST` | `/api/schedules?day=N&action=reorder&version=…` | ✔ | Ubah urutan (`orderedIds`) |
| `PUT` | `/api/schedules/:id` | ✔ | Edit satu pelajaran |
| `DELETE` | `/api/schedules/:id` | ✔ | Hapus satu pelajaran |
| `GET` | `/api/schedule-settings` | — | Mode jadwal + periode ujian |
| `PUT` | `/api/schedule-settings` | ✔ | Simpan mode jadwal + periode ujian |
| `GET` | `/api/assignments` | — | Semua tugas |
| `POST` | `/api/assignments` | ✔ | Tambah tugas |
| `PUT` | `/api/assignments/:id` | ✔ | Edit tugas |
| `DELETE` | `/api/assignments/:id` | ✔ | Hapus tugas |
| `GET`/`PUT` | `/api/settings` | GET publik, PUT admin | Informasi kelas |
| `GET` | `/api/auth/me` | — | Sesi aktif |
| `POST` | `/api/auth/setup` | — | Buat admin pertama (sekali) |
| `POST` | `/api/auth/login` | — | Login |
| `POST` | `/api/auth/logout` | — | Logout |

Semua endpoint tulis memanggil `requireAdmin()` di server. Autentikasi tidak hanya dijaga di UI.

## Jadwal A, Jadwal B, dan Jadwal Ujian

Ada **tiga jadwal terpisah** di database, bukan tiga tampilan dari satu data. Mengedit satu jadwal tidak menyentuh yang lain.

| Versi | Kapan dipakai | Tabel |
|---|---|---|
| **A** | Minggu ke-1 dan ke-2 setiap bulan | `daily_schedules.version = 'A'` |
| **B** | Minggu ke-3, ke-4, dan ke-5 | `daily_schedules.version = 'B'` |
| **EXAM** | Saat mode ujian aktif | `daily_schedules.version = 'EXAM'` |

Minggu dihitung tetap dari tanggal: `ceil(tanggal / 7)` → tanggal 1–7 minggu 1, 8–14 minggu 2, 15–21 minggu 3, 22–28 minggu 4, 29–31 minggu 5. Februari tidak pernah mencapai minggu 5; bulan 31 hari selalu bisa.

### Mode jadwal (`/admin/mode-jadwal`)

Urutan prioritas, dievaluasi terhadap **tanggal yang sedang ditampilkan** (jadi sudah memperhitungkan pergantian 19.00):

1. **Mode ujian** — aktif dan tanggal hari ini di dalam rentang ujian → tampilkan Jadwal Ujian.
2. **Manual A** — paksa Jadwal A.
3. **Manual B** — paksa Jadwal B.
4. **Otomatis** — minggu 1–2 → A, minggu 3+ → B.

Mode ujian tanpa tanggal mulai/selesai berjalan terus sampai dimatikan manual. Dengan tanggal, mode ujian berhenti sendiri setelah tanggal selesai dan jadwal kembali mengikuti aturan di bawahnya. Mengganti mode meminta konfirmasi di UI.

Logikanya satu fungsi murni, `resolveActiveSchedule()` di `src/lib/schedule-version.ts`, dipakai server dan client sekaligus — sehingga label, badge, dan jadwal yang tampil tidak mungkin berbeda antara keduanya. Karena evaluasinya memakai tanggal tampil, pergantian bulan (mis. 30 Nov minggu 5 → 1 Des minggu 1) otomatis ikut berganti ke Jadwal A.

Item pada Jadwal Ujian punya dua kolom tambahan: `room` (ruang ujian) dan `exam_date`. Kolom itu diabaikan pada Jadwal A dan B.

Tugas **tidak** terpengaruh mode jadwal: daftar tugas tetap sama di semua mode.

## Aturan pergantian hari

Satu fungsi murni, `resolveDisplayDay()` di `src/lib/schedule-day.ts`, dipakai **server dan client** — logika tidak mungkin berbeda.

| Waktu (Asia/Jakarta) | Jadwal ditampilkan |
|---|---|
| Senin–Kamis sebelum 19.00 | hari itu |
| Senin–Kamis 19.00 dst. | hari berikutnya |
| Jumat sebelum 19.00 | Jumat |
| Jumat 19.00 dst. | Senin berikutnya |
| Sabtu & Minggu | Senin berikutnya |

Zona waktu dihitung dari `Intl.DateTimeFormat` dengan `timeZone: "Asia/Jakarta"`, bukan dari timezone perangkat. Client memakai tick 1 detik + resync saat tab kembali aktif, jadi pergantian terjadi tanpa reload dan tetap benar setelah browser ditinggal lama. **Data jadwal di database tidak pernah diubah** saat hari berganti — hanya hari yang ditampilkan yang berubah.

## Struktur database

- `class_settings` — satu baris (id=1) untuk identitas kelas
- `daily_schedules` — satu baris per (versi, hari); `version` ∈ `A`, `B`, `EXAM`, unik pada `(version, day_of_week)`
- `schedule_items` — pelajaran, FK ke `daily_schedules` (`ON DELETE CASCADE`), punya `sort_order`, plus `room`/`exam_date` untuk ujian
- `schedule_settings` — satu baris (id=1): `mode`, `exam_enabled`, `exam_start_date`, `exam_end_date`
- `assignments` — tugas, tidak pernah dihapus otomatis saat deadline lewat
- `admin_users` — akun admin dengan `password_hash`
- `admin_sessions` — sesi aktif, FK ke `admin_users`

Migration dijalankan otomatis saat koneksi pertama (`src/lib/db.ts`, DDL-nya `idempotent` dengan `CREATE TABLE IF NOT EXISTS`). Database lama yang masih satu-jadwal dimigrasikan di tempat: kolom `version` ditambahkan dengan default `'A'`, sehingga jadwal lama otomatis menjadi Jadwal A, baris tetap memakai id yang sama agar FK `schedule_items` tidak putus, dan constraint unik lama diganti menjadi `(version, day_of_week)`. Tidak ada data yang dihapus. Operasi multi-baris (reorder, seed) memakai transaksi. Waktu disimpan sebagai `TIMESTAMPTZ`, deadline tugas dan tanggal ujian sebagai `DATE` — keduanya dipetakan ke string ISO di `repository.ts` agar hasil query sama di `pg` maupun PGlite.

## Testing

```bash
npm run typecheck    # TypeScript strict
npm run lint         # ESLint
npm test             # 93 unit test (Vitest) — berjalan di Postgres sungguhan (PGlite)
npm run e2e          # cek HTTP + restart server sungguhan
npm run test:ui      # cek interaksi browser (Playwright)
```

`npm run e2e` dan `npm run test:ui` memerlukan `npm run build` terlebih dahulu.

Cakupan penting:

- **Pergantian hari** — semua batas 19.00, Sabtu/Minggu, dan hasil identik di berbagai TZ host.
- **Pergantian minggu** — tanggal 1–31 dipetakan ke minggu 1–5, termasuk batas bulan (30 Nov minggu 5 → 1 Des minggu 1) dan Februari yang tidak pernah mencapai minggu 5.
- **Prioritas mode** — ujian > manual A/B > otomatis, plus periode ujian tanpa tanggal, dan jadwal ujian kosong.
- **Isolasi versi** — item A, B, dan EXAM tidak saling bocor; statistik kelas tidak menghitung entri ujian.
- **Persistensi** — jadwal, tugas, mode jadwal, dan akun admin diperiksa setelah proses server benar-benar dimatikan dan dijalankan ulang.
- **CRUD individual** — edit/hapus satu pelajaran tidak menyentuh pelajaran lain.
- **Keamanan** — tanpa login: `401` pada semua endpoint tulis, `/admin` redirect ke login.
- **Auto-switch UI** — jam difake melewati 19.00; hari berganti tanpa reload dokumen.

## Struktur folder

```
src/
  app/
    page.tsx                     beranda publik
    jadwal/page.tsx              halaman jadwal + tugas
    admin/(dashboard)/           halaman admin (dilindungi layout)
    api/                         route handler
  components/
    public/                      header, footer, timeline, daftar tugas, hook hari aktif
    admin/                       shell, form jadwal (A/B/EXAM), panel mode jadwal, form tugas, form pengaturan
    ui/                          toast, badge, empty state
  lib/
    time.ts                      konversi waktu Asia/Jakarta
    schedule-day.ts              aturan pergantian hari (sumber tunggal)
    schedule-version.ts          minggu ke bulan, periode ujian, prioritas mode jadwal
    db.ts                        koneksi + migration
    repository.ts                query database
    auth.ts                      session & autentikasi
    password.ts                  hash scrypt
    validation.ts                skema Zod
tests/                           unit test
scripts/                         e2e, ui-test, seed, screenshot, audit
```

## Catatan deployment

Deploy ke Vercel + Supabase:

1. Buat project di [supabase.com](https://supabase.com).
2. Ambil connection string dari **Project Settings → Database → Connection string → Connection pooling**. Pakai host pooler port `6543` (bukan `5432` langsung) — pooler wajib untuk lingkungan serverless karena tiap instance Vercel membuka koneksi sendiri.
3. Set environment variable di Vercel:

   | Variable | Nilai |
   |---|---|
   | `DATABASE_URL` | connection string pooler dari langkah 2 |
   | `DATABASE_SSL` | `require` |
   | `DATABASE_POOL_MAX` | `1`–`3` (hemat limit koneksi Supabase) |

   Tambahkan `?sslmode=require` di akhir `DATABASE_URL` bila provider tidak membaca `DATABASE_SSL`.

4. Deploy. Skema dibuat otomatis pada request pertama — tidak perlu migration manual.
5. Buka `/admin/login` di domain Vercel dan buat akun admin pertama.

Catatan lain:

- Tanpa `DATABASE_URL`, aplikasi memakai PGlite di `.data/pglite`. Folder ini **tidak** boleh diandalkan di Vercel (filesystem ephemeral dan read-only), jadi selalu set `DATABASE_URL` di produksi.
- Kamus sandi admin memakai `scrypt` bawaan Node, tidak ada secret yang perlu di-hardcode.
- Set `NODE_ENV=production` (Vercel otomatis) agar cookie session memakai flag `Secure`.
- Supabase free tier membatasi jumlah koneksi; `DATABASE_POOL_MAX` kecil + pooler port `6543` sudah cukup untuk trafik satu kelas.
