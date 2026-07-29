import type { DbStudent } from "../types/db-types"
import type { SchoolClass } from "../types/academic-types"

export const DB_STUDENTS: DbStudent[] = [
  { id: "st_1",  name: "Popescu Andrei" },
  { id: "st_2",  name: "Ionescu Maria" },
  { id: "st_3",  name: "Vasilescu Dan" },
  { id: "st_4",  name: "Georgescu Ana" },
  { id: "st_5",  name: "Dumitrescu Elena" },
  { id: "st_6",  name: "Radu Mihai" },
  { id: "st_7",  name: "Stancu Gabriel" },
  { id: "st_8",  name: "Stoica Ioana" },
  { id: "st_9",  name: "Dinu Cristian" },
  { id: "st_10", name: "Stan Bianca" },
  { id: "st_11", name: "Rusu Alexandru" },
  { id: "st_12", name: "Mihalcea Laura" },
  { id: "st_13", name: "Sandu Corina" },
  { id: "st_14", name: "Marcu Vlad" },
  { id: "st_15", name: "Nistor George" },
  { id: "st_16", name: "Teodorescu Alina" },
  { id: "st_17", name: "Dobre Ionuț" },
  { id: "st_18", name: "Vasile Roxana" },
  { id: "st_19", name: "Marin Eduard" },
  { id: "st_20", name: "Oprea Simona" },
  { id: "st_21", name: "Năstase Tudor" },
  { id: "st_22", name: "Florea Anca" },
  { id: "st_23", name: "Barbu Robert" },
  { id: "st_24", name: "Ene Mihaela" },
  { id: "st_25", name: "Preda Costel" },
  { id: "st_26", name: "Alexandru Diana" },
  { id: "st_27", name: "Luca Ștefan" },
  { id: "st_28", name: "Gheorghe Carmen" },
  { id: "st_29", name: "Pavel Marius" },
  { id: "st_30", name: "Badea Raluca" },
  { id: "st_31", name: "Miron Costin" },
]

export const DB_ASSIGNMENTS = [
  { id: "as_1", title: "Monografia satului arhaic în Baltagul", deadline: "2026-05-24T23:59:00" },
]

export const CLASS_STUDENTS: Record<SchoolClass, string[]> = {
  "10A": ["Andrei Popescu", "Maria Ionescu", "Vlad Constantin", "Elena Dumitrescu"],
  "10B": ["Radu Gheorghe", "Ioana Popa", "Cristian Marin", "Alina Stoica"],
  "11A": ["Mihai Stanescu", "Ana Vasilescu", "Bogdan Neagu", "Simona Rusu"],
  "11B": ["Cosmin Dima", "Laura Barbu", "Florin Tudose", "Roxana Lupescu"],
  "12A": [
    "Andrei Popescu", "Maria Ionescu", "Vlad Constantin", "Elena Dumitrescu",
    "Radu Gheorghe", "Ioana Popa", "Cristian Marin", "Alina Stoica",
  ],
  "12B": DB_STUDENTS.map((s) => s.name),
}
