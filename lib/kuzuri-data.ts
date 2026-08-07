export type TabId = "today" | "train" | "fuel" | "mind";

export type OverlayId =
  | "pulse"
  | "session"
  | "location"
  | "quick"
  | "coach"
  | "builder"
  | "meal"
  | "goals"
  | "seals"
  | "me"
  | "day";

export type TrainingLocation = "Bahrain" | "Riyadh";

export type ExerciseSet = {
  id: string;
  setNumber: number;
  weightKg: number | string;
  reps: number | "";
  targetReps: string;
  intensity?: string;
  rpe?: number;
  done: boolean;
  loggedAt?: string;
};

export type Exercise = {
  id: string;
  name: string;
  tag: string;
  code: string;
  prep?: boolean;
  prepDone?: boolean;
  collapsed?: boolean;
  restSeconds: number;
  previousBest: string;
  lastPerformed: string;
  recommended: string;
  note?: string;
  lastSets?: Array<{ weight: string | number; reps: number | null } | null>;
  lastSetsByLocation?: Partial<Record<TrainingLocation, Array<{ weight: string | number; reps: number | null } | null>>>;
  lastNote?: string;
  nextNote?: string;
  sets: ExerciseSet[];
};

export type WorkoutSession = {
  id: string;
  date: string;
  title: string;
  program: string;
  status: "planned" | "active" | "complete";
  notes: string;
  exercises: Exercise[];
};

export type SplitExercise = {
  id: string;
  name: string;
  sets: number;
  repRange: string;
};

export type SplitWorkout = {
  id: string;
  name: string;
  focus: string;
  lastPerformed: string;
  estimatedMinutes: number;
  exercises: SplitExercise[];
};

export type TrainingSplit = {
  id: string;
  name: string;
  cadence: string;
  nextWorkoutId: string;
  workouts: SplitWorkout[];
};

export type LiftHistoryPoint = {
  date: string;
  topSet: string;
  volumeKg: number;
  e1rm: number;
};

export type RunLog = {
  date: string;
  title: string;
  distanceKm: number;
  pace: string;
  duration: string;
  source: "manual" | "strava" | "runna";
};

export type MealLog = {
  id: string;
  meal: "Breakfast" | "Lunch" | "Dinner" | "Snack";
  name: string;
  loggedAt?: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type LearningSession = {
  id: string;
  domain: string;
  minutes: number;
  format: "book" | "paper" | "course" | "video" | "podcast";
  title: string;
};

export type DayLog = {
  date: string;
  label: string;
  sleep: string;
  recovery: number;
  weightKg: number;
  workout?: string;
  run?: string;
  meals: MealLog[];
  learning: LearningSession[];
};

export type Seal = {
  id: string;
  group: "Train" | "Run" | "Fuel" | "Pulse" | "Mind";
  title: string;
  description: string;
  status: "earned" | "progress" | "locked";
  progress?: number;
  earnedOn?: string;
};

export type KuzuriState = {
  selectedTab: TabId;
  selectedOverlay: OverlayId | null;
  selectedDayIndex: number;
  learningTimerRunning: boolean;
  learningTimerSeconds: number;
  selectedDomain: string;
  activeTrainingLocation: TrainingLocation;
  user: {
    name: string;
    identity: string;
    heightCm: number;
    birthYear: number;
    units: "metric" | "imperial";
  };
  connections: {
    whoop: boolean;
    strava: boolean;
    runna: boolean;
    appleHealth: boolean;
  };
  coachPrefs: {
    draftDay: boolean;
    mayMoveWorkouts: boolean;
    weeklyReview: boolean;
  };
  macroGoals: {
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  splitPlan: {
    activeSplitId: string;
    splits: TrainingSplit[];
  };
  todaySession: WorkoutSession;
  liftHistory: Record<string, LiftHistoryPoint[]>;
  runLogs: RunLog[];
  meals: MealLog[];
  dayLogs: DayLog[];
  seals: Seal[];
};

export const initialState: KuzuriState = {
  selectedTab: "today",
  selectedOverlay: null,
  selectedDayIndex: 4,
  learningTimerRunning: false,
  learningTimerSeconds: 34 * 60,
  selectedDomain: "AI",
  activeTrainingLocation: "Bahrain",
  user: {
    name: "Abdulla",
    identity: "lifting · running · reading since 2024",
    heightCm: 178,
    birthYear: 1997,
    units: "metric"
  },
  connections: {
    whoop: true,
    strava: true,
    runna: true,
    appleHealth: false
  },
  coachPrefs: {
    draftDay: true,
    mayMoveWorkouts: false,
    weeklyReview: true
  },
  macroGoals: {
    kcal: 2450,
    protein: 180,
    carbs: 260,
    fat: 75
  },
  splitPlan: {
    activeSplitId: "upper-lower-strength",
    splits: [
      {
        id: "upper-lower-strength",
        name: "Build your own week.",
        cadence: "a blank week: add your first days.",
        nextWorkoutId: "push",
        workouts: [
          {
            id: "push",
            name: "Push",
            focus: "favorites: bench press, deadlift",
            lastPerformed: "tap the name to rename it",
            estimatedMinutes: 45,
            exercises: [
              { id: "push-bench-press", name: "Bench Press", sets: 3, repRange: "8-12" },
              { id: "push-deadlift", name: "Deadlift", sets: 3, repRange: "8-12" }
            ]
          }
        ]
      }
    ]
  },
  todaySession: {
    id: "session-2026-08-07",
    date: "2026-08-07",
    title: "Lower II",
    program: "Upper / Lower Strength",
    status: "active",
    notes: "Warmup first. Hamstrings and squats need clean setup.",
    exercises: [
      {
        id: "copenhagen-side-plank",
        name: "Copenhagen Side Plank",
        tag: "Prep",
        code: "P1",
        prep: true,
        prepDone: false,
        restSeconds: 45,
        previousBest: "2 x 15-30s",
        lastPerformed: "2026-07-31",
        recommended: "Start at the knee",
        note: "Start at the knee",
        sets: [
          { id: "prep-copenhagen-1", setNumber: 1, weightKg: "", reps: "", targetReps: "15-30s", intensity: "Low", done: false },
          { id: "prep-copenhagen-2", setNumber: 2, weightKg: "", reps: "", targetReps: "15-30s", intensity: "Low", done: false }
        ]
      },
      {
        id: "counterbalance-squat",
        name: "Counterbalance Heels-Elevated Squat",
        tag: "Prep",
        code: "P2",
        prep: true,
        prepDone: false,
        restSeconds: 45,
        previousBest: "2 x 10-15",
        lastPerformed: "2026-07-31",
        recommended: "Slow reps",
        sets: [
          { id: "prep-counterbalance-1", setNumber: 1, weightKg: "", reps: "", targetReps: "10-15", intensity: "Low", done: false },
          { id: "prep-counterbalance-2", setNumber: 2, weightKg: "", reps: "", targetReps: "10-15", intensity: "Low", done: false }
        ]
      },
      {
        id: "b-stance-rdl",
        name: "B-stance RDL",
        tag: "Prep",
        code: "P3",
        prep: true,
        prepDone: false,
        restSeconds: 45,
        previousBest: "2 x 10-15",
        lastPerformed: "2026-07-31",
        recommended: "High intent",
        sets: [
          { id: "prep-bstance-1", setNumber: 1, weightKg: "", reps: "", targetReps: "10-15", intensity: "High", done: false },
          { id: "prep-bstance-2", setNumber: 2, weightKg: "", reps: "", targetReps: "10-15", intensity: "High", done: false }
        ]
      },
      {
        id: "seated-hamstring-curls",
        name: "Seated Hamstring Curls",
        tag: "A1",
        code: "A1",
        restSeconds: 90,
        previousBest: "50 kg x 10",
        lastPerformed: "2026-07-31",
        recommended: "50 kg x 8-10",
        note: "Hammer strength machine",
        lastSets: [{ weight: 45, reps: 10 }, { weight: 50, reps: 10 }],
        lastSetsByLocation: {
          Bahrain: [{ weight: 45, reps: 10 }, { weight: 50, reps: 10 }],
          Riyadh: [{ weight: 42.5, reps: 10 }, { weight: 45, reps: 9 }]
        },
        lastNote: "Hammer strength machine",
        sets: [
          { id: "ham-curl-1", setNumber: 1, weightKg: "", reps: "", targetReps: "8-10", intensity: "1-0 RIR", done: false },
          { id: "ham-curl-2", setNumber: 2, weightKg: "", reps: "", targetReps: "8-10", intensity: "1-0 RIR", done: false }
        ]
      },
      {
        id: "high-bar-back-squat",
        name: "High-Bar Back Squat",
        tag: "B1",
        code: "B1",
        restSeconds: 150,
        previousBest: "100 kg x 6",
        lastPerformed: "2026-07-31",
        recommended: "100 kg x 6-8",
        lastSets: [{ weight: 100, reps: 6 }, { weight: 100, reps: 6 }, { weight: 100, reps: 6 }],
        lastSetsByLocation: {
          Bahrain: [{ weight: 100, reps: 6 }, { weight: 100, reps: 6 }, { weight: 100, reps: 6 }],
          Riyadh: [{ weight: 95, reps: 6 }, { weight: 95, reps: 6 }, { weight: 95, reps: 5 }]
        },
        sets: [
          { id: "squat-1", setNumber: 1, weightKg: "", reps: "", targetReps: "6-8", intensity: "1-2 RIR", done: false },
          { id: "squat-2", setNumber: 2, weightKg: "", reps: "", targetReps: "6-8", intensity: "1-2 RIR", done: false },
          { id: "squat-3", setNumber: 3, weightKg: "", reps: "", targetReps: "6-8", intensity: "1-2 RIR", done: false }
        ]
      },
      {
        id: "pendulum-squat",
        name: "Pendulum Squat",
        tag: "C1",
        code: "C1",
        restSeconds: 120,
        previousBest: "60 kg x 10",
        lastPerformed: "2026-07-31",
        recommended: "40 kg, then 60 kg",
        lastSets: [{ weight: 40, reps: 10 }, { weight: 60, reps: 10 }, null],
        lastSetsByLocation: {
          Bahrain: [{ weight: 40, reps: 10 }, { weight: 60, reps: 10 }, null],
          Riyadh: [{ weight: 35, reps: 10 }, { weight: 55, reps: 10 }, null]
        },
        sets: [
          { id: "pendulum-1", setNumber: 1, weightKg: "", reps: "", targetReps: "6-8", intensity: "1-0 RIR", done: false },
          { id: "pendulum-2", setNumber: 2, weightKg: "", reps: "", targetReps: "12-15", intensity: "1-0 RIR", done: false },
          { id: "pendulum-3", setNumber: 3, weightKg: "", reps: "", targetReps: "12-15", intensity: "1-0 RIR", done: false }
        ]
      },
      {
        id: "quad-extension",
        name: "Quad Extension",
        tag: "D1",
        code: "D1",
        restSeconds: 90,
        previousBest: "3 working sets",
        lastPerformed: "2026-07-31",
        recommended: "8-15 reps",
        sets: [
          { id: "quad-1", setNumber: 1, weightKg: "", reps: "", targetReps: "8-15", intensity: "3-4 RIR", done: false },
          { id: "quad-2", setNumber: 2, weightKg: "", reps: "", targetReps: "8-15", intensity: "3-4 RIR", done: false },
          { id: "quad-3", setNumber: 3, weightKg: "", reps: "", targetReps: "8-15", intensity: "3-4 RIR", done: false }
        ]
      },
      {
        id: "cable-oh-triceps",
        name: "Cable OH Triceps Ext",
        tag: "E1",
        code: "E1",
        restSeconds: 75,
        previousBest: "3 working sets",
        lastPerformed: "2026-07-31",
        recommended: "8-12 reps",
        sets: [
          { id: "triceps-1", setNumber: 1, weightKg: "", reps: "", targetReps: "8-12", intensity: "1-0 RIR", done: false },
          { id: "triceps-2", setNumber: 2, weightKg: "", reps: "", targetReps: "8-12", intensity: "1-0 RIR", done: false },
          { id: "triceps-3", setNumber: 3, weightKg: "", reps: "", targetReps: "8-12", intensity: "1-0 RIR", done: false }
        ]
      },
      {
        id: "incline-hammer-curls",
        name: "SA Incline Hammer Curls",
        tag: "F1",
        code: "F1",
        restSeconds: 75,
        previousBest: "3 working sets",
        lastPerformed: "2026-07-31",
        recommended: "8-15 reps",
        sets: [
          { id: "hammer-1", setNumber: 1, weightKg: "", reps: "", targetReps: "8-15", intensity: "1-2 RIR", done: false },
          { id: "hammer-2", setNumber: 2, weightKg: "", reps: "", targetReps: "8-15", intensity: "1-2 RIR", done: false },
          { id: "hammer-3", setNumber: 3, weightKg: "", reps: "", targetReps: "8-15", intensity: "1-2 RIR", done: false }
        ]
      }
    ]
  },
  liftHistory: {
    "bench-press": [
      { date: "2026-07-10", topSet: "57.5 x 8", volumeKg: 1395, e1rm: 72.8 },
      { date: "2026-07-17", topSet: "60 x 7", volumeKg: 1470, e1rm: 74 },
      { date: "2026-07-24", topSet: "62.5 x 6", volumeKg: 1512.5, e1rm: 75 },
      { date: "2026-07-31", topSet: "62.5 x 7", volumeKg: 1562.5, e1rm: 77.1 }
    ],
    row: [
      { date: "2026-07-10", topSet: "40 x 10", volumeKg: 1180, e1rm: 53.3 },
      { date: "2026-07-17", topSet: "40 x 12", volumeKg: 1280, e1rm: 56 },
      { date: "2026-07-24", topSet: "42.5 x 9", volumeKg: 1275, e1rm: 55.3 },
      { date: "2026-07-31", topSet: "42.5 x 10", volumeKg: 1317.5, e1rm: 56.7 }
    ],
    "incline-db": [
      { date: "2026-07-10", topSet: "22 x 10", volumeKg: 660, e1rm: 29.3 },
      { date: "2026-07-17", topSet: "22 x 11", volumeKg: 704, e1rm: 30.1 },
      { date: "2026-07-24", topSet: "24 x 8", volumeKg: 696, e1rm: 30.4 },
      { date: "2026-07-31", topSet: "24 x 9", volumeKg: 744, e1rm: 31.2 }
    ]
  },
  runLogs: [
    { date: "2026-08-04", title: "Easy run", distanceKm: 9.2, pace: "5:42 /km", duration: "52:26", source: "strava" },
    { date: "2026-08-02", title: "Tempo", distanceKm: 6, pace: "4:58 /km", duration: "29:48", source: "manual" }
  ],
  meals: [
    { id: "m1", meal: "Snack", name: "Fuel log", loggedAt: "2026-08-07T08:20:00.000+03:00", kcal: 446, protein: 42, carbs: 52, fat: 10 },
    { id: "m2", meal: "Snack", name: "Fuel log", loggedAt: "2026-08-07T13:15:00.000+03:00", kcal: 650, protein: 62, carbs: 64, fat: 18 },
    { id: "m3", meal: "Snack", name: "Fuel log", loggedAt: "2026-08-07T18:45:00.000+03:00", kcal: 235, protein: 24, carbs: 28, fat: 3 }
  ],
  dayLogs: [
    {
      date: "2026-07-27",
      label: "Monday · 27 Jul",
      sleep: "7h 12m",
      recovery: 73,
      weightKg: 82.9,
      workout: "Lower I · 10 sets · 48 min",
      meals: [
        { id: "d1a", meal: "Breakfast", name: "Fuel log", kcal: 620, protein: 45, carbs: 72, fat: 14 },
        { id: "d1b", meal: "Lunch", name: "Fuel log", kcal: 820, protein: 58, carbs: 88, fat: 24 },
        { id: "d1c", meal: "Dinner", name: "Fuel log", kcal: 670, protein: 54, carbs: 55, fat: 26 }
      ],
      learning: [{ id: "l1", domain: "AI", minutes: 42, format: "paper", title: "Agent evaluation notes" }]
    },
    {
      date: "2026-07-28",
      label: "Tuesday · 28 Jul",
      sleep: "6h 45m",
      recovery: 62,
      weightKg: 82.7,
      run: "Easy run · 9.2 km · 52:26",
      meals: [
        { id: "d2a", meal: "Breakfast", name: "Fuel log", kcal: 540, protein: 35, carbs: 64, fat: 16 },
        { id: "d2b", meal: "Lunch", name: "Fuel log", kcal: 780, protein: 52, carbs: 90, fat: 20 },
        { id: "d2c", meal: "Snack", name: "Fuel log", kcal: 640, protein: 36, carbs: 68, fat: 24 }
      ],
      learning: [{ id: "l2", domain: "Investing", minutes: 35, format: "podcast", title: "Markets recap" }]
    },
    {
      date: "2026-07-29",
      label: "Wednesday · 29 Jul",
      sleep: "6h 10m",
      recovery: 32,
      weightKg: 86.8,
      workout: "Upper II · 24 sets · 55 min",
      meals: [
        { id: "d3a", meal: "Breakfast", name: "Fuel log", kcal: 470, protein: 32, carbs: 58, fat: 12 },
        { id: "d3b", meal: "Lunch", name: "Fuel log", kcal: 620, protein: 44, carbs: 74, fat: 16 },
        { id: "d3c", meal: "Dinner", name: "Fuel log", kcal: 690, protein: 52, carbs: 62, fat: 26 },
        { id: "d3d", meal: "Snack", name: "Fuel log", kcal: 250, protein: 22, carbs: 24, fat: 6 }
      ],
      learning: [
        { id: "l3a", domain: "History", minutes: 35, format: "podcast", title: "Ottoman trade routes" },
        { id: "l3b", domain: "AI", minutes: 35, format: "paper", title: "Agent evaluation notes" }
      ]
    },
    {
      date: "2026-07-30",
      label: "Thursday · 30 Jul",
      sleep: "6h 55m",
      recovery: 58,
      weightKg: 82.4,
      meals: [
        { id: "d4a", meal: "Breakfast", name: "Fuel log", kcal: 480, protein: 34, carbs: 52, fat: 14 },
        { id: "d4b", meal: "Lunch", name: "Fuel log", kcal: 760, protein: 48, carbs: 82, fat: 24 },
        { id: "d4c", meal: "Dinner", name: "Fuel log", kcal: 640, protein: 42, carbs: 58, fat: 24 }
      ],
      learning: [{ id: "l4", domain: "History", minutes: 31, format: "podcast", title: "Ottoman trade routes" }]
    },
    {
      date: "2026-07-31",
      label: "Friday · 31 Jul · today",
      sleep: "7h 24m",
      recovery: 66,
      weightKg: 82.3,
      workout: "Upper I · 17 sets · 55 min",
      meals: [],
      learning: [{ id: "l5", domain: "AI", minutes: 34, format: "course", title: "Model routing" }]
    },
    {
      date: "2026-08-01",
      label: "Saturday · 1 Aug",
      sleep: "",
      recovery: 0,
      weightKg: 0,
      meals: [],
      learning: []
    },
    {
      date: "2026-08-02",
      label: "Sunday · 2 Aug",
      sleep: "",
      recovery: 0,
      weightKg: 0,
      meals: [],
      learning: []
    }
  ],
  seals: [
    { id: "session-sealed", group: "Train", title: "Session Sealed", description: "Finish today's Upper I", status: "progress", progress: 56 },
    { id: "iron-month", group: "Train", title: "Iron Month", description: "20 sessions in 30 days · 16 in", status: "progress", progress: 80 },
    { id: "century-sets", group: "Train", title: "Century of Sets", description: "1,000 sets · sealed in May", status: "earned", earnedOn: "2026-05-28" },
    { id: "plate-club", group: "Train", title: "Plate Club", description: "Bench 100 kg · 62.5 now", status: "locked" },
    { id: "first-10k", group: "Run", title: "First 10K", description: "10.4 km · sealed in June", status: "earned", earnedOn: "2026-06-12" },
    { id: "negative-split", group: "Run", title: "Negative Split", description: "Faster second half · 2 of 3 runs", status: "progress", progress: 66 },
    { id: "protein-week", group: "Fuel", title: "Week of Protein", description: "7 straight days on target", status: "earned", earnedOn: "2026-07-20" },
    { id: "green-streak", group: "Pulse", title: "Green Streak", description: "10 green recoveries · 6 in", status: "progress", progress: 60 },
    { id: "thread", group: "Mind", title: "The Thread", description: "12-day learning streak · alive", status: "earned", earnedOn: "2026-08-01" },
    { id: "century-club", group: "Mind", title: "Century Club", description: "100 h of AI · 42 in", status: "progress", progress: 42 }
  ]
};

export const domains = [
  { name: "AI", hours: 42, color: "#1E4D38", formats: "papers · courses · videos" },
  { name: "Investing", hours: 18, color: "#A97C50", formats: "reading · podcasts" },
  { name: "Philosophy", hours: 24, color: "#5F9678", formats: "reading · audio" },
  { name: "History", hours: 11, color: "#8B5A2B", formats: "podcasts · videos" },
  { name: "Novels", hours: 9, color: "#B4593B", formats: "reading, before sleep" }
];

export function calculateTotals(meals: MealLog[]) {
  return meals.reduce(
    (totals, meal) => ({
      kcal: totals.kcal + meal.kcal,
      protein: totals.protein + meal.protein,
      carbs: totals.carbs + meal.carbs,
      fat: totals.fat + meal.fat
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

export function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
