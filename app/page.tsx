"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Apple,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Flame,
  History,
  Medal,
  Moon,
  Plus,
  Settings,
  Sparkles,
  Timer,
  Utensils,
  X
} from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { getSupabaseClient } from "@/lib/supabase-client";
import {
  calculateTotals,
  domains,
  formatTimer,
  initialState,
  type Exercise,
  type KuzuriState,
  type MealLog,
  type OverlayId,
  type SplitExercise,
  type SplitWorkout,
  type TabId,
  type TrainingLocation
} from "@/lib/kuzuri-data";

const storageKey = "kuzuri_rebuild_v9";
const trainingLocations: TrainingLocation[] = ["Bahrain", "Riyadh"];

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "today", label: "Today" },
  { id: "train", label: "Train" },
  { id: "fuel", label: "Fuel" },
  { id: "mind", label: "Mind" }
];

function splitExercise(name: string): SplitExercise {
  return {
    id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${crypto.randomUUID()}`,
    name,
    sets: 3,
    repRange: "8-12"
  };
}

function moveItem<T>(items: T[], from: number, to: number) {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function normalizeSavedState(saved: Partial<KuzuriState>): KuzuriState {
  const merged = { ...initialState, ...saved, selectedOverlay: null } as KuzuriState;
  const fallbackPlan = initialState.splitPlan;
  const plan = saved.splitPlan ?? fallbackPlan;

  return {
    ...merged,
    splitPlan: {
      activeSplitId: plan.activeSplitId || fallbackPlan.activeSplitId,
      splits: (plan.splits?.length ? plan.splits : fallbackPlan.splits).map((split) => ({
        ...split,
        workouts: split.workouts.map((workout) => ({
          ...workout,
          exercises: workout.exercises.map((exercise, index) => {
            if (typeof exercise === "string") {
              return {
                id: `${workout.id}-exercise-${index}`,
                name: exercise,
                sets: 3,
                repRange: "8-12"
              };
            }
            return {
              ...exercise,
              id: exercise.id || `${workout.id}-exercise-${index}`,
              sets: exercise.sets || 3,
              repRange: exercise.repRange || "8-12"
            };
          })
        }))
      }))
    }
  };
}

function toTimeValue(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function timestampForToday(timeValue: string) {
  const [hours = "0", minutes = "0"] = timeValue.split(":");
  const timestamp = new Date();
  timestamp.setHours(Number(hours), Number(minutes), 0, 0);
  return timestamp.toISOString();
}

function formatFuelLogTime(loggedAt?: string) {
  if (!loggedAt) return "time not set";
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(loggedAt));
}

export default function Home() {
  const [state, setState] = useState<KuzuriState>(initialState);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [syncStatus, setSyncStatus] = useState<"loading" | "signed-out" | "local" | "saving" | "synced" | "error">("loading");
  const [expandedExercise, setExpandedExercise] = useState("seated-hamstring-curls");
  const [expandedSetId, setExpandedSetId] = useState("");
  const [prepExpanded, setPrepExpanded] = useState(true);
  const [fuelDraft, setFuelDraft] = useState({ protein: 45, carbs: 80, fat: 22 });
  const [trainMode, setTrainMode] = useState<"lift" | "run">("lift");
  const [restSeconds, setRestSeconds] = useState(0);
  const [restPaused, setRestPaused] = useState(false);
  const didLoadStorage = useRef(false);
  const syncTimer = useRef<number | null>(null);
  const supabase = useMemo(() => getSupabaseClient(), []);

  useEffect(() => {
    let cancelled = false;

    function loadLocalState() {
      const saved = window.localStorage.getItem(storageKey);
      if (!saved) return;
      try {
        setState(normalizeSavedState(JSON.parse(saved) as Partial<KuzuriState>));
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }

    async function loadCloudState(userId: string) {
      if (!supabase) return false;
      const { data, error } = await supabase
        .from("kuzuri_states")
        .select("state")
        .eq("user_id", userId)
        .maybeSingle();

      if (cancelled) return false;
      if (error) {
        setSyncStatus("error");
        return false;
      }
      if (data?.state) {
        setState(normalizeSavedState(data.state as Partial<KuzuriState>));
        return true;
      }
      return false;
    }

    async function boot() {
      if (!supabase) {
        loadLocalState();
        setSyncStatus("local");
        return;
      }

      setSyncStatus("loading");
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const userId = data.session?.user.id ?? null;
      setSessionUserId(userId);

      if (userId) {
        const loadedCloud = await loadCloudState(userId);
        if (!loadedCloud) loadLocalState();
        if (!cancelled) setSyncStatus("synced");
      } else {
        loadLocalState();
        setSyncStatus("signed-out");
      }
    }

    void boot();

    const authListener = supabase?.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user.id ?? null;
      setSessionUserId(userId);
      if (!userId) {
        setSyncStatus("signed-out");
        return;
      }
      setSyncStatus("loading");
      void loadCloudState(userId).then((loadedCloud) => {
        if (!loadedCloud) {
          setSyncStatus("saving");
        } else {
          setSyncStatus("synced");
        }
      });
    });

    return () => {
      cancelled = true;
      authListener?.data.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!didLoadStorage.current) {
      didLoadStorage.current = true;
      return;
    }
    const persistableState: KuzuriState = { ...state, selectedOverlay: null };
    window.localStorage.setItem(storageKey, JSON.stringify(persistableState));

    if (!supabase || !sessionUserId) return;
    if (syncTimer.current) window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => {
      setSyncStatus("saving");
      void supabase
        .from("kuzuri_states")
        .upsert({
          user_id: sessionUserId,
          state: persistableState,
          updated_at: new Date().toISOString()
        })
        .then(({ error }) => setSyncStatus(error ? "error" : "synced"));
    }, 650);
  }, [sessionUserId, state, supabase]);

  async function requestMagicLink() {
    if (!supabase || !authEmail.trim()) return;
    setAuthMessage("Sending secure link...");
    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail.trim(),
      options: { emailRedirectTo: window.location.origin }
    });
    setAuthMessage(error ? error.message : "Check your email for the Kuzuri sign-in link.");
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSessionUserId(null);
    setSyncStatus("signed-out");
  }

  useEffect(() => {
    if (!state.learningTimerRunning) return;
    const id = window.setInterval(() => {
      setState((current) => ({ ...current, learningTimerSeconds: current.learningTimerSeconds + 1 }));
    }, 1000);
    return () => window.clearInterval(id);
  }, [state.learningTimerRunning]);

  useEffect(() => {
    if (restSeconds <= 0 || restPaused) return;
    const id = window.setInterval(() => {
      setRestSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [restPaused, restSeconds]);

  const totals = useMemo(() => calculateTotals(state.meals), [state.meals]);
  const completedSets = state.todaySession.exercises.reduce(
    (count, exercise) => count + (exercise.prep ? 0 : exercise.sets.filter((set) => set.done).length),
    0
  );
  const totalSets = state.todaySession.exercises.reduce((count, exercise) => count + (exercise.prep ? 0 : exercise.sets.length), 0);
  const currentDay = state.dayLogs[state.selectedDayIndex];
  const selectedExercise = state.todaySession.exercises.find((exercise) => exercise.id === expandedExercise);

  function openOverlay(overlay: OverlayId) {
    setState((current) => ({ ...current, selectedOverlay: overlay }));
  }

  function closeOverlay() {
    setState((current) => ({ ...current, selectedOverlay: null }));
  }

  function updateExerciseSet(exerciseId: string, setId: string, patch: Partial<{ weightKg: number | string; reps: number | ""; done: boolean }>) {
    if (patch.done === true || (patch.weightKg !== undefined && patch.reps !== undefined)) {
      setRestSeconds(90);
      setRestPaused(false);
    }
    setState((current) => ({
      ...current,
      todaySession: {
        ...current.todaySession,
        exercises: current.todaySession.exercises.map((exercise) =>
          exercise.id !== exerciseId
            ? exercise
            : {
                ...exercise,
                sets: exercise.sets.map((set) => (set.id === setId ? { ...set, ...patch, loggedAt: patch.done === false ? undefined : set.loggedAt ?? new Date().toISOString() } : set))
              }
        )
      }
    }));
  }

  function togglePrepItem(exerciseId: string) {
    setState((current) => ({
      ...current,
      todaySession: {
        ...current.todaySession,
        exercises: current.todaySession.exercises.map((exercise) =>
          exercise.id === exerciseId ? { ...exercise, prepDone: !exercise.prepDone } : exercise
        )
      }
    }));
  }

  function markAllPrepDone() {
    setPrepExpanded(false);
    setState((current) => ({
      ...current,
      todaySession: {
        ...current.todaySession,
        exercises: current.todaySession.exercises.map((exercise) =>
          exercise.prep ? { ...exercise, prepDone: true } : exercise
        )
      }
    }));
  }

  function addExerciseSet(exerciseId: string) {
    setState((current) => ({
      ...current,
      todaySession: {
        ...current.todaySession,
        exercises: current.todaySession.exercises.map((exercise) => {
          if (exercise.id !== exerciseId) return exercise;
          const last = exercise.sets.at(-1);
          const nextNumber = exercise.sets.length + 1;
          return {
            ...exercise,
            collapsed: false,
            sets: [
              ...exercise.sets,
              {
                id: `${exercise.id}-${Date.now()}`,
                setNumber: nextNumber,
                weightKg: "",
                reps: "",
                targetReps: last?.targetReps ?? "",
                intensity: last?.intensity,
                done: false
              }
            ]
          };
        })
      }
    }));
  }

  function removeLastExerciseSet(exerciseId: string) {
    setState((current) => ({
      ...current,
      todaySession: {
        ...current.todaySession,
        exercises: current.todaySession.exercises.map((exercise) => {
          if (exercise.id !== exerciseId || exercise.sets.length <= 1) return exercise;
          const last = exercise.sets.at(-1);
          if (last?.done) return exercise;
          return { ...exercise, sets: exercise.sets.slice(0, -1) };
        })
      }
    }));
  }

  function updateExerciseNextNote(exerciseId: string, nextNote: string) {
    setState((current) => ({
      ...current,
      todaySession: {
        ...current.todaySession,
        exercises: current.todaySession.exercises.map((exercise) =>
          exercise.id === exerciseId ? { ...exercise, nextNote } : exercise
        )
      }
    }));
  }

  function selectTrainingLocation(location: TrainingLocation) {
    setState((current) => ({
      ...current,
      activeTrainingLocation: location,
      selectedOverlay: "session"
    }));
  }

  function finishWorkout() {
    setState((current) => ({
      ...current,
      selectedOverlay: null,
      todaySession: {
        ...current.todaySession,
        status: "complete",
        exercises: current.todaySession.exercises.map((exercise) => {
          if (exercise.prep) return exercise;
          const loggedSets = exercise.sets
            .filter((set) => set.done)
            .map((set) => ({ weight: set.weightKg || "—", reps: set.reps === "" ? null : set.reps }));
          if (!loggedSets.length) return exercise;
          return {
            ...exercise,
            lastSets: loggedSets,
            lastSetsByLocation: {
              ...exercise.lastSetsByLocation,
              [current.activeTrainingLocation]: loggedSets
            }
          };
        })
      },
      seals: current.seals.map((seal) =>
        seal.id === "session-sealed"
          ? { ...seal, status: "earned", progress: 100, earnedOn: new Date().toISOString().slice(0, 10) }
          : seal
      ),
      dayLogs: current.dayLogs.map((day, index) =>
        index === 4 ? { ...day, workout: `${current.todaySession.title} · ${current.activeTrainingLocation} · ${totalSets} sets complete` } : day
      )
    }));
  }

  function addFuelLog(macros: { protein: number; carbs: number; fat: number }, loggedAt: string) {
    const kcal = macros.protein * 4 + macros.carbs * 4 + macros.fat * 9;
    setState((current) => ({
      ...current,
      meals: [{
        id: crypto.randomUUID(),
        meal: "Snack",
        name: "Fuel log",
        loggedAt,
        kcal,
        ...macros
      }, ...current.meals],
      selectedOverlay: null
    }));
  }

  function removeTodayMeal(id: string) {
    setState((current) => ({ ...current, meals: current.meals.filter((meal) => meal.id !== id) }));
  }

  function setTab(tab: TabId) {
    setState((current) => ({ ...current, selectedTab: tab, selectedOverlay: null }));
  }

  return (
    <main className="app-shell">
      <section className="device">
        {supabase && !sessionUserId && (
          <AuthGate
            email={authEmail}
            message={authMessage}
            loading={syncStatus === "loading"}
            setEmail={setAuthEmail}
            requestMagicLink={requestMagicLink}
          />
        )}
        {supabase && sessionUserId && (
          <SyncBadge status={syncStatus} signOut={signOut} />
        )}
        <div className="main-scroll">
          {state.selectedTab === "today" && (
            <TodayView
              state={state}
              completedSets={completedSets}
              totalSets={totalSets}
              openOverlay={openOverlay}
              setState={setState}
            />
          )}
          {state.selectedTab === "train" && (
            <TrainView
              state={state}
              openOverlay={openOverlay}
              trainMode={trainMode}
              setTrainMode={setTrainMode}
            />
          )}
          {state.selectedTab === "fuel" && (
            <FuelView
              state={state}
              totals={totals}
              openOverlay={openOverlay}
              removeMeal={removeTodayMeal}
            />
          )}
          {state.selectedTab === "mind" && <MindView state={state} setState={setState} openOverlay={openOverlay} />}
        </div>
        <nav className="nav" aria-label="Primary">
          {tabs.slice(0, 2).map((tab) => (
            <button
              className={`tab-button ${state.selectedTab === tab.id ? "active" : ""}`}
              key={tab.id}
              onClick={() => setTab(tab.id)}
            >
              <span className={`tab-mark ${tab.id}`} aria-hidden="true" />
              {tab.label}
            </button>
          ))}
          <button className="quick-nav-button" onClick={() => openOverlay("quick")} aria-label="Quick actions">
            <Plus size={30} strokeWidth={1.5} />
          </button>
          {tabs.slice(2).map((tab) => (
            <button
              className={`tab-button ${state.selectedTab === tab.id ? "active" : ""}`}
              key={tab.id}
              onClick={() => setTab(tab.id)}
            >
              <span className={`tab-mark ${tab.id}`} aria-hidden="true" />
              {tab.label}
            </button>
          ))}
        </nav>
        {state.selectedOverlay === "pulse" && (
          <FullScreenOverlay>
            <PulseOverlay state={state} close={closeOverlay} />
          </FullScreenOverlay>
        )}
        {state.selectedOverlay === "session" && (
          <FullScreenOverlay>
            <SessionOverlay
              state={state}
              expandedExercise={expandedExercise}
              expandedSetId={expandedSetId}
              prepExpanded={prepExpanded}
              setExpandedExercise={setExpandedExercise}
              setExpandedSetId={setExpandedSetId}
              setPrepExpanded={setPrepExpanded}
              updateExerciseSet={updateExerciseSet}
              togglePrepItem={togglePrepItem}
              markAllPrepDone={markAllPrepDone}
              addExerciseSet={addExerciseSet}
              removeLastExerciseSet={removeLastExerciseSet}
              updateExerciseNextNote={updateExerciseNextNote}
              finishWorkout={finishWorkout}
              restSeconds={restSeconds}
              restPaused={restPaused}
              setRestPaused={setRestPaused}
              setRestSeconds={setRestSeconds}
              close={closeOverlay}
            />
          </FullScreenOverlay>
        )}
        {state.selectedOverlay === "day" && (
          <FullScreenOverlay>
            <DayOverlay
              day={currentDay}
              index={state.selectedDayIndex}
              state={state}
              setState={setState}
              close={closeOverlay}
            />
          </FullScreenOverlay>
        )}
        {state.selectedOverlay === "builder" && (
          <FullScreenOverlay>
            <BuilderOverlay state={state} setState={setState} close={closeOverlay} />
          </FullScreenOverlay>
        )}
        {state.selectedOverlay && !["pulse", "session", "day", "builder"].includes(state.selectedOverlay) && (
          <Overlay title={overlayTitle(state.selectedOverlay)} close={closeOverlay}>
            {state.selectedOverlay === "quick" && <QuickOverlay openOverlay={openOverlay} setState={setState} />}
            {state.selectedOverlay === "location" && (
              <LocationOverlay state={state} selectTrainingLocation={selectTrainingLocation} />
            )}
            {state.selectedOverlay === "coach" && <CoachOverlay state={state} setState={setState} />}
            {state.selectedOverlay === "meal" && (
              <FuelLogOverlay draft={fuelDraft} setDraft={setFuelDraft} addFuelLog={addFuelLog} />
            )}
            {state.selectedOverlay === "goals" && <GoalsOverlay state={state} setState={setState} />}
            {state.selectedOverlay === "seals" && <SealsOverlay state={state} />}
            {state.selectedOverlay === "me" && <MeOverlay state={state} setState={setState} openOverlay={openOverlay} />}
          </Overlay>
        )}
      </section>
    </main>
  );
}

function Topbar({ openOverlay }: { openOverlay: (overlay: OverlayId) => void }) {
  return (
    <div className="topbar">
      <div className="brand">
        <span className="eyebrow">Kuzuri</span>
        <h1>Life OS</h1>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="icon-button" onClick={() => openOverlay("quick")} aria-label="Quick actions">
          <Plus size={21} />
        </button>
        <button className="avatar-button" onClick={() => openOverlay("me")} aria-label="Profile">
          A
        </button>
      </div>
    </div>
  );
}

function AuthGate({
  email,
  message,
  loading,
  setEmail,
  requestMagicLink
}: {
  email: string;
  message: string;
  loading: boolean;
  setEmail: (email: string) => void;
  requestMagicLink: () => void;
}) {
  return (
    <div className="auth-gate">
      <div className="auth-card">
        <span className="builder-kicker">Kuzuri</span>
        <h2>Your source of truth.</h2>
        <p>Sign in to save workouts, splits, fuel, learning, and weekly history to Supabase.</p>
        <input
          type="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button onClick={requestMagicLink} disabled={loading || !email.trim()}>
          {loading ? "Checking..." : "Send sign-in link"}
        </button>
        {message && <em>{message}</em>}
      </div>
    </div>
  );
}

function SyncBadge({
  status,
  signOut
}: {
  status: "loading" | "signed-out" | "local" | "saving" | "synced" | "error";
  signOut: () => void;
}) {
  const labels = {
    loading: "loading",
    "signed-out": "signed out",
    local: "local",
    saving: "saving",
    synced: "synced",
    error: "sync issue"
  };
  return (
    <div className={`sync-badge ${status}`}>
      <span>{labels[status]}</span>
      <button onClick={signOut}>Sign out</button>
    </div>
  );
}

function TodayView({
  state,
  completedSets,
  totalSets,
  openOverlay,
  setState
}: {
  state: KuzuriState;
  completedSets: number;
  totalSets: number;
  openOverlay: (overlay: OverlayId) => void;
  setState: React.Dispatch<React.SetStateAction<KuzuriState>>;
}) {
  const designWeek = [
    { d: "M", n: 27 },
    { d: "T", n: 28 },
    { d: "W", n: 29 },
    { d: "T", n: 30 },
    { d: "F", n: 31 },
    { d: "S", n: 1 },
    { d: "S", n: 2 }
  ];

  return (
    <div className="today-screen">
      <div className="today-head">
        <div className="today-date">Fri · 31 Jul</div>
        <div className="today-actions">
          <button className="today-avatar" onClick={() => openOverlay("me")} aria-label="Profile">S</button>
          <button className="today-sun" aria-label="Theme">☼</button>
        </div>
      </div>

      <div className="four-label">The Four, Today</div>
      <div className="four-grid">
        <button className="four-item" onClick={() => setState((current) => ({ ...current, selectedTab: "train" }))}>
          <span className="four-ring train-ring" />
          <strong>Train</strong>
        </button>
        <button className="four-item" onClick={() => openOverlay("pulse")}>
          <span className="four-ring pulse-ring"><span /></span>
          <strong>Pulse</strong>
        </button>
        <button className="four-item" onClick={() => setState((current) => ({ ...current, selectedTab: "fuel" }))}>
          <span className="four-ring fuel-ring" />
          <strong>Fuel</strong>
        </button>
        <button className="four-item" onClick={() => setState((current) => ({ ...current, selectedTab: "mind" }))}>
          <span className="four-ring mind-ring" />
          <strong>Mind</strong>
        </button>
      </div>
      <div className="day-yours">The day is yours.</div>

      <div className="week-title">This Week</div>
      <div className="week-strip">
        {designWeek.map((day, index) => (
          <button
            key={`${day.d}-${day.n}`}
            className={`day-pill ${index === 4 ? "active" : ""} ${index > 4 ? "future" : ""}`}
            onClick={() => setState((current) => ({ ...current, selectedDayIndex: index, selectedOverlay: "day" }))}
          >
            <span className="day-letter">{day.d}</span>
            <span className="day-number">{day.n}</span>
            <span className="dot-row">
              {index <= 4 && <span className="dot" style={{ color: "#3E7A5E" }} />}
              {[0, 2, 4].includes(index) && <span className="dot" style={{ color: "#C99B62" }} />}
              {[1, 3, 4].includes(index) && <span className="dot" style={{ color: "#5F9678" }} />}
            </span>
          </button>
        ))}
      </div>

      <div className="seneca-block">
        <div>He who is brave is free.</div>
          <span>Seneca</span>
      </div>

      <div className="up-next-card">
        <div className="up-next-head">
          <span>Up Next</span>
          <em>~55 min</em>
        </div>
        <h2>{state.todaySession.title}</h2>
        <p>8 exercises · bench 62.5 kg last time</p>
        <div className="up-next-actions">
          <button className="begin-button" onClick={() => openOverlay("location")}>Begin</button>
          <button className="not-today-button">Not today</button>
        </div>
      </div>

      <button className="coach-card" onClick={() => openOverlay("coach")}>
        <div className="coach-card-head">
          <span>Coach</span>
          <em>{completedSets} / {totalSets}</em>
        </div>
        <p>&ldquo;Recovery is tender — tonight I would trade intervals for zone 2.&rdquo;</p>
        <small>suggests only — nothing changes without your yes ›</small>
      </button>

      <div className="looking-back">
        <span>Looking Back</span>
        <button onClick={() => openOverlay("seals")}>12-day thread · your seals ›</button>
      </div>
    </div>
  );
}

function TrainView({
  state,
  openOverlay,
  trainMode,
  setTrainMode
}: {
  state: KuzuriState;
  openOverlay: (overlay: OverlayId) => void;
  trainMode: "lift" | "run";
  setTrainMode: (mode: "lift" | "run") => void;
}) {
  const activeSplit = state.splitPlan.splits.find((split) => split.id === state.splitPlan.activeSplitId) ?? state.splitPlan.splits[0];
  const programs = activeSplit.workouts.map((workout) => ({
    ...workout,
    last: workout.id === activeSplit.nextWorkoutId
      ? state.todaySession.status === "complete" ? "today" : "next up"
      : workout.lastPerformed,
    next: workout.id === activeSplit.nextWorkoutId
  }));
  const plan = [
    { day: "FRI", title: "Intervals", detail: "6 x 400 m · 5K pace · 90s jog" },
    { day: "SAT", title: "Long run", detail: "14 km · easy · zone 2" }
  ];

  return (
    <div className="train-screen">
      <div className="train-kicker">Train</div>
      <div className="train-title-row">
        <h2>The work, logged.</h2>
        <button onClick={() => openOverlay("builder")}>Edit split ›</button>
      </div>
      <div className="train-toggle">
        <button className={trainMode === "lift" ? "active" : ""} onClick={() => setTrainMode("lift")}>Lifting</button>
        <button className={trainMode === "run" ? "active" : ""} onClick={() => setTrainMode("run")}>Running</button>
      </div>

      {trainMode === "lift" && (
        <div className="program-stack">
          {programs.map((program) => (
            <div className={`program-card ${program.next ? "next" : ""}`} key={program.name}>
              <div className="program-head">
                <h3>{program.name}</h3>
                <span>{program.last}</span>
              </div>
              <p>{program.exercises.length} exercises · {program.focus}</p>
              {program.next && (
                <button className="session-start-button" onClick={() => openOverlay("location")}>Begin session</button>
              )}
            </div>
          ))}
        </div>
      )}

      {trainMode === "run" && (
        <div>
          <div className="sync-head">
            <span>The Plan</span>
            <em><i style={{ background: "#A97C50" }} />via Runna · synced</em>
          </div>
          <div className="run-plan-stack">
            {plan.map((run) => (
              <div className="run-plan-card" key={`${run.day}-${run.title}`}>
                <span>{run.day}</span>
                <div>
                  <h3>{run.title}</h3>
                  <p>{run.detail}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="sync-head recent">
            <span>Recent Runs</span>
            <em><i style={{ background: "#5F9678" }} />via Strava</em>
          </div>
          <div className="run-plan-stack">
            {state.runLogs.map((run) => (
              <div className="recent-run-card" key={`${run.date}-${run.title}`}>
                <div className="program-head">
                  <h3>{run.title}</h3>
                  <span>{run.date.slice(5)}</span>
                </div>
                <p>{run.distanceKm} km <span>{run.pace}</span> <span>{run.duration}</span></p>
              </div>
            ))}
          </div>
          <div className="run-note">15.2 km this week · hips quiet.</div>
        </div>
      )}
    </div>
  );
}

function ExerciseList({
  exercises,
  expandedExercise,
  expandedSetId,
  activeTrainingLocation,
  setExpandedExercise,
  setExpandedSetId,
  updateExerciseSet,
  addExerciseSet,
  removeLastExerciseSet,
  updateExerciseNextNote
}: {
  exercises: Exercise[];
  expandedExercise: string;
  expandedSetId: string;
  activeTrainingLocation: TrainingLocation;
  setExpandedExercise: (id: string) => void;
  setExpandedSetId: (id: string) => void;
  updateExerciseSet: (exerciseId: string, setId: string, patch: Partial<{ weightKg: number | string; reps: number | ""; done: boolean }>) => void;
  addExerciseSet: (exerciseId: string) => void;
  removeLastExerciseSet: (exerciseId: string) => void;
  updateExerciseNextNote: (exerciseId: string, nextNote: string) => void;
}) {
  const workExercises = exercises.filter((exercise) => !exercise.prep);

  return (
    <div className="exercise-list">
      {workExercises.map((exercise) => {
        const allDone = exercise.sets.every((set) => set.done);
        const anyLogged = exercise.sets.some((set) => set.done);
        const open = expandedExercise === exercise.id && !exercise.collapsed;
        const done = exercise.sets.filter((set) => set.done).length;
        const locationLastSets = exercise.lastSetsByLocation?.[activeTrainingLocation] ?? exercise.lastSets;
        const lastLine = locationLastSets
          ?.filter(Boolean)
          .map((set) => `${set?.weight}×${set?.reps ?? ""}`)
          .join(", ");
        const summary = exercise.sets
          .filter((set) => set.done)
          .map((set) => `${set.weightKg || "—"}×${set.reps || "—"}`)
          .join(", ");
        return (
          <div className={`exercise-card ${allDone ? "done" : ""} ${open ? "open" : ""}`} key={exercise.id}>
            <button className="exercise-head" onClick={() => setExpandedExercise(open ? "" : exercise.id)}>
              {!anyLogged ? <GripDots /> : <span className="grip-placeholder" aria-hidden="true" />}
              <span className="exercise-code">{exercise.code}</span>
              <div className="exercise-title-stack">
                <h3>{exercise.name}</h3>
                {!open && summary && <p className="exercise-summary">{summary}</p>}
              </div>
              <div className="exercise-side">
                <span>{done}/{exercise.sets.length}</span>
                <ChevronDown size={15} />
              </div>
            </button>
            {open && (
              <div className="exercise-body">
                <div className="exercise-prescription">{exercise.sets.length} sets · {exercise.sets[0]?.intensity}</div>
                {lastLine && <div className="exercise-last">last in {activeTrainingLocation}: {lastLine}</div>}
                {exercise.lastNote && <div className="exercise-last-note">last note · {exercise.lastNote}</div>}
                <div className="set-grid">
                  {exercise.sets.map((set) => {
                    const setKey = `${exercise.id}:${set.id}`;
                    const isExpanded = expandedSetId === setKey;
                    if (isExpanded) {
                      return (
                        <div className="set-row expanded" key={set.id}>
                          <div className="set-expand-meta">
                            <span className="set-num">{set.setNumber}</span>
                            <span className="set-range">{set.targetReps}</span>
                            <span>Set {set.setNumber} of {exercise.sets.length}</span>
                          </div>
                          {lastLine && (
                            <div className="prep-chips">
                              {locationLastSets?.filter(Boolean).map((lastSet, index) => (
                                <button
                                  className={index === 0 ? "suggest" : ""}
                                  key={`${exercise.id}-last-${index}`}
                                  onClick={() => updateExerciseSet(exercise.id, set.id, { weightKg: lastSet?.weight ?? "", reps: lastSet?.reps ?? "" })}
                                >
                                  {lastSet?.weight}×{lastSet?.reps ?? ""}
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="set-input-row">
                            <input
                              aria-label="Weight"
                              inputMode="decimal"
                              placeholder="kg or BW"
                              value={set.weightKg}
                              onChange={(event) => updateExerciseSet(exercise.id, set.id, { weightKg: event.target.value })}
                            />
                            <span>×</span>
                            <input
                              aria-label="Reps"
                              inputMode="numeric"
                              placeholder="reps"
                              value={set.reps}
                              onChange={(event) => updateExerciseSet(exercise.id, set.id, { reps: event.target.value === "" ? "" : Number(event.target.value) })}
                            />
                            <button
                              className="set-save-btn"
                              onClick={() => {
                                updateExerciseSet(exercise.id, set.id, { done: true });
                                setExpandedSetId("");
                              }}
                              aria-label="Save set"
                            >
                              <Check size={15} />
                            </button>
                            {set.done && (
                              <button
                                className="set-clear-btn"
                                onClick={() => {
                                  updateExerciseSet(exercise.id, set.id, { weightKg: "", reps: "", done: false });
                                  setExpandedSetId("");
                                }}
                                aria-label="Clear set"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <button className={`set-row ${set.done ? "logged" : ""}`} key={set.id} onClick={() => setExpandedSetId(setKey)}>
                        <span className="set-num">{set.setNumber}</span>
                        <span className="set-range">{set.targetReps}</span>
                        {set.done ? (
                          <span className="set-logged-vals">{set.weightKg || "—"} kg <span>×</span> {set.reps || "—"}</span>
                        ) : (
                          <span className="set-hint">Tap to log</span>
                        )}
                        {set.done ? <Check size={14} /> : <ChevronRight size={15} />}
                      </button>
                    );
                  })}
                </div>
                <div className="exercise-set-actions">
                  <button onClick={() => addExerciseSet(exercise.id)}>+ Add a set</button>
                  {exercise.sets.length > 1 && !exercise.sets.at(-1)?.done && (
                    <button className="remove" onClick={() => removeLastExerciseSet(exercise.id)}>− Remove last</button>
                  )}
                </div>
                <label className="next-note-label">
                  Note for next time <span>optional</span>
                  <textarea
                    value={exercise.nextNote ?? ""}
                    placeholder="Hack squat 70 next time · used straps · machine 3 felt better"
                    onChange={(event) => updateExerciseNextNote(exercise.id, event.target.value)}
                  />
                </label>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function GripDots() {
  return (
    <span className="grip-dots" aria-hidden="true">
      <span /><span /><span /><span /><span /><span />
    </span>
  );
}

function Stepper({ value, decrement, increment }: { value: string; decrement: () => void; increment: () => void }) {
  return (
    <div className="stepper">
      <button onClick={decrement} aria-label="Decrease">−</button>
      <span>{value}</span>
      <button onClick={increment} aria-label="Increase">+</button>
    </div>
  );
}

function ExerciseHistoryCard({ exercise, state }: { exercise: Exercise; state: KuzuriState }) {
  const data = state.liftHistory[exercise.id] ?? [];
  return (
    <div className="card panel">
      <span className="eyebrow">Exercise history</span>
      <h3>{exercise.name}</h3>
      <p className="subtle">Last performed {exercise.lastPerformed}. Use this before loading the bar.</p>
      <div style={{ width: "100%", height: 160, marginTop: 10 }}>
        <ResponsiveContainer>
          <BarChart data={data}>
            <XAxis dataKey="date" hide />
            <YAxis hide />
            <Tooltip cursor={false} />
            <Bar dataKey="volumeKg" fill="#3E7A5E" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="history-grid">
        {data.map((point) => (
          <div className="history-row" key={point.date}>
            <span className="subtle">{point.date.slice(5)}</span>
            <strong>{point.topSet}</strong>
            <span className="subtle">{point.e1rm} e1RM</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FuelView({
  state,
  totals,
  openOverlay,
  removeMeal
}: {
  state: KuzuriState;
  totals: ReturnType<typeof calculateTotals>;
  openOverlay: (overlay: OverlayId) => void;
  removeMeal: (id: string) => void;
}) {
  const macroRows = [
    { name: "Protein", value: totals.protein, goal: state.macroGoals.protein, color: "#1E4D38" },
    { name: "Carbs", value: totals.carbs, goal: state.macroGoals.carbs, color: "#A97C50" },
    { name: "Fat", value: totals.fat, goal: state.macroGoals.fat, color: "#C99B62" }
  ];
  const remaining = {
    kcal: Math.max(0, state.macroGoals.kcal - totals.kcal),
    protein: Math.max(0, state.macroGoals.protein - totals.protein),
    carbs: Math.max(0, state.macroGoals.carbs - totals.carbs),
    fat: Math.max(0, state.macroGoals.fat - totals.fat)
  };

  return (
    <div className="fuel-design-screen">
      <div className="fuel-design-kicker">Fuel · Today</div>
      <div className="fuel-design-title-row">
        <h2>What went in.</h2>
        <button onClick={() => openOverlay("goals")}>Targets ›</button>
      </div>

      <div className="fuel-summary-card">
        <div className="fuel-summary-inner">
          <div className="fuel-calorie-ring">
            <svg width="104" height="104" viewBox="0 0 104 104">
              <circle cx="52" cy="52" r="44" fill="none" stroke="#E7E1D0" strokeWidth="7" />
              <circle
                cx="52"
                cy="52"
                r="44"
                fill="none"
                stroke="#1E4D38"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray="276.5"
                strokeDashoffset={276.5 * (1 - Math.min(1, totals.kcal / state.macroGoals.kcal))}
                transform="rotate(-90 52 52)"
              />
            </svg>
            <div>
              <strong>{remaining.kcal}</strong>
              <span>kcal left</span>
            </div>
          </div>
          <div className="fuel-design-macros">
            {macroRows.map((macro) => (
              <div key={macro.name}>
                <div className="fuel-design-macro-line">
                  <span>{macro.name}</span>
                  <span>{macro.value} / {macro.goal} g</span>
                </div>
                <div className="fuel-design-track">
                  <div style={{ width: `${Math.min(100, macro.value / macro.goal * 100)}%`, background: macro.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="fuel-note">{totals.protein >= state.macroGoals.protein * 0.7 ? "Protein on pace. The rest is detail." : "Protein is behind — front-load the evening."}</div>
      </div>

      <button className="fuel-log-pill" onClick={() => openOverlay("meal")}>Log fuel</button>

      <div className="fuel-weight-card">
        <div className="fuel-card-head">
          <span>Weighed</span>
          <em>trend · 14 days</em>
        </div>
        <div className="fuel-weight-title">
          <strong>82.3 kg</strong>
          <em>trending −0.32 kg / wk</em>
        </div>
        <svg width="100%" height="80" viewBox="0 0 300 80" preserveAspectRatio="none" className="fuel-weight-chart">
          <polyline points="4,60 28,55 52,57 76,48 100,51 124,42 148,39 172,36 196,33 220,31 244,26 268,23 296,20" fill="none" stroke="#1E4D38" strokeWidth="2" strokeLinecap="round" />
          {[60, 55, 57, 48, 51, 42, 39, 36, 33, 31, 26, 23, 20].map((cy, index) => (
            <circle key={`${cy}-${index}`} cx={4 + index * 24} cy={cy} r="2.6" fill="#C99B62" />
          ))}
        </svg>
        <div className="fuel-corr">On a 2,410 kcal average → −0.32 kg / wk. The cut is on schedule.</div>
        <div className="fuel-weight-actions">
          <button>−</button>
          <span>82.3 kg</span>
          <button>+</button>
          <button>Log weight</button>
        </div>
      </div>

      <div className="fuel-section-label">Logged</div>
      <div className="fuel-logged-list">
        {state.meals.map((meal) => (
          <div className="fuel-design-log" key={meal.id}>
            <div>
              <strong>{meal.name}</strong>
              <p>{formatFuelLogTime(meal.loggedAt)} · {meal.kcal} kcal · P{meal.protein} C{meal.carbs} F{meal.fat}</p>
            </div>
            <button onClick={() => removeMeal(meal.id)} aria-label="Remove fuel log">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function FuelLogOverlay({
  draft,
  setDraft,
  addFuelLog
}: {
  draft: { protein: number; carbs: number; fat: number };
  setDraft: React.Dispatch<React.SetStateAction<{ protein: number; carbs: number; fat: number }>>;
  addFuelLog: (macros: { protein: number; carbs: number; fat: number }, loggedAt: string) => void;
}) {
  const [timeValue, setTimeValue] = useState(() => toTimeValue(new Date()));
  const setTimeToNow = () => setTimeValue(toTimeValue(new Date()));
  const kcal = draft.protein * 4 + draft.carbs * 4 + draft.fat * 9;
  const fields = [
    { key: "protein", label: "Protein", short: "P", multiplier: 4, color: "#1E4D38" },
    { key: "carbs", label: "Carbs", short: "C", multiplier: 4, color: "#A97C50" },
    { key: "fat", label: "Fat", short: "F", multiplier: 9, color: "#C99B62" }
  ] as const;

  return (
    <div className="fuel-log-sheet">
      <div className="fuel-total-preview">
        <span className="eyebrow">Calculated</span>
        <h3>{kcal} kcal</h3>
        <p>P×4 + C×4 + F×9</p>
      </div>
      <label className="macro-input-row fuel-time-row">
        <span>T</span>
        <div>
          <strong>Time logged</strong>
          <em>Auto-picked now. Change it if needed.</em>
        </div>
        <div className="fuel-time-controls">
          <input
            type="time"
            value={timeValue}
            onChange={(event) => setTimeValue(event.target.value)}
          />
          <button type="button" onClick={setTimeToNow}>Now</button>
        </div>
      </label>
      {fields.map((field) => (
        <label className="macro-input-row" key={field.key}>
          <span style={{ background: field.color }}>{field.short}</span>
          <div>
            <strong>{field.label}</strong>
            <em>{field.multiplier} kcal per gram</em>
          </div>
          <input
            inputMode="numeric"
            min={0}
            type="number"
            value={draft[field.key]}
            onChange={(event) => setDraft((current) => ({ ...current, [field.key]: Number(event.target.value) || 0 }))}
          />
          <small>g</small>
        </label>
      ))}
      <button className="primary-button fuel-save-button" onClick={() => addFuelLog(draft, timestampForToday(timeValue))}>Log fuel</button>
    </div>
  );
}

function MindView({
  state,
  setState,
  openOverlay
}: {
  state: KuzuriState;
  setState: React.Dispatch<React.SetStateAction<KuzuriState>>;
  openOverlay: (overlay: OverlayId) => void;
}) {
  const maxHours = Math.max(...domains.map((domain) => domain.hours));
  return (
    <div className="desktop-grid">
      <div>
        <div className="section-title">
          <span className="eyebrow">Mind</span>
          <h2>{formatTimer(state.learningTimerSeconds)}</h2>
          <p className="subtle">{state.learningTimerRunning ? `The clock is running · ${state.selectedDomain}` : "Pick a domain, press begin."}</p>
        </div>
        <div className="card dark-card panel">
          <div className="chips">
            {domains.map((domain) => (
              <button
                className={`chip ${state.selectedDomain === domain.name ? "active" : ""}`}
                key={domain.name}
                onClick={() => setState((current) => ({ ...current, selectedDomain: domain.name }))}
              >
                {domain.name}
              </button>
            ))}
          </div>
          <div style={{ height: 14 }} />
          <button
            className="primary-button"
            onClick={() => setState((current) => ({ ...current, learningTimerRunning: !current.learningTimerRunning }))}
          >
            <Timer size={16} /> {state.learningTimerRunning ? "Stop & log" : "Begin"}
          </button>
        </div>
      </div>
      <div className="list" style={{ marginTop: 18 }}>
        <button className="action" onClick={() => openOverlay("seals")}>
          <div className="row">
            <div>
              <span className="eyebrow">The Thread</span>
              <h3>12-day learning streak</h3>
              <p className="subtle">4.6 h this week · goal 6 h</p>
            </div>
            <Medal />
          </div>
        </button>
        <div className="card panel">
          <span className="eyebrow">Domains</span>
          {domains.map((domain) => (
            <div className="domain-row" key={domain.name}>
              <div>
                <strong>{domain.name}</strong>
                <p className="subtle">{domain.hours} h · {domain.formats}</p>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${domain.hours / maxHours * 100}%`, background: domain.color }} /></div>
              </div>
              <span className="eyebrow">{Math.round(domain.hours / maxHours * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Overlay({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return (
    <div className="overlay-backdrop">
      <div className="overlay-sheet">
        <div className="overlay-title">
          <div>
            <span className="eyebrow">Kuzuri</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={close} aria-label="Close"><X size={19} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FullScreenOverlay({ children }: { children: React.ReactNode }) {
  return <div className="fullscreen-overlay">{children}</div>;
}

function SessionOverlay({
  state,
  expandedExercise,
  expandedSetId,
  prepExpanded,
  setExpandedExercise,
  setExpandedSetId,
  setPrepExpanded,
  updateExerciseSet,
  togglePrepItem,
  markAllPrepDone,
  addExerciseSet,
  removeLastExerciseSet,
  updateExerciseNextNote,
  finishWorkout,
  restSeconds,
  restPaused,
  setRestPaused,
  setRestSeconds,
  close
}: {
  state: KuzuriState;
  expandedExercise: string;
  expandedSetId: string;
  prepExpanded: boolean;
  setExpandedExercise: (id: string) => void;
  setExpandedSetId: (id: string) => void;
  setPrepExpanded: (expanded: boolean) => void;
  updateExerciseSet: (exerciseId: string, setId: string, patch: Partial<{ weightKg: number | string; reps: number | ""; done: boolean }>) => void;
  togglePrepItem: (exerciseId: string) => void;
  markAllPrepDone: () => void;
  addExerciseSet: (exerciseId: string) => void;
  removeLastExerciseSet: (exerciseId: string) => void;
  updateExerciseNextNote: (exerciseId: string, nextNote: string) => void;
  finishWorkout: () => void;
  restSeconds: number;
  restPaused: boolean;
  setRestPaused: (paused: boolean) => void;
  setRestSeconds: React.Dispatch<React.SetStateAction<number>>;
  close: () => void;
}) {
  const prepExercises = state.todaySession.exercises.filter((exercise) => exercise.prep);
  const prepDone = prepExercises.filter((exercise) => exercise.prepDone).length;
  const doneSets = state.todaySession.exercises.reduce((count, exercise) => count + (exercise.prep ? 0 : exercise.sets.filter((set) => set.done).length), 0);
  const totalSets = state.todaySession.exercises.reduce((count, exercise) => count + (exercise.prep ? 0 : exercise.sets.length), 0);
  const minutes = Math.floor(restSeconds / 60);
  const seconds = restSeconds % 60;
  const restTotal = 90;
  const restCircumference = 2 * Math.PI * 32;
  const restOffset = restCircumference * (1 - Math.min(1, restSeconds / restTotal));

  return (
    <div className="session-screen">
      <div className="overlay-controls">
        <button className="overlay-ctrl-button" aria-label="Theme"><Moon size={16} /></button>
        <button className="overlay-ctrl-button" onClick={close} aria-label="Close">×</button>
      </div>
      <div className="session-scroll">
        <div className="session-head">
          <div>
            <div className="session-kicker">In Session</div>
            <h2>{state.todaySession.title}</h2>
            <p>{state.activeTrainingLocation} · just started · {doneSets} of {totalSets} sets</p>
          </div>
        </div>
        {prepExercises.length > 0 && (
          <div className={`prep-card ${prepDone === prepExercises.length ? "done" : ""}`}>
            <button className="prep-card-head" onClick={() => setPrepExpanded(!prepExpanded)}>
              <div>
                <span>Prep</span>
                <h3>Warmup &amp; activation</h3>
                <p>{prepExercises.length} items · {prepDone} of {prepExercises.length}</p>
              </div>
              <ChevronDown size={15} />
            </button>
            {prepExpanded && (
              <div className="prep-card-body">
                {prepExercises.map((exercise) => (
                  <button className={`prep-item ${exercise.prepDone ? "done" : ""}`} key={exercise.id} onClick={() => togglePrepItem(exercise.id)}>
                    <span className="prep-tick">{exercise.prepDone ? "✓" : ""}</span>
                    <span>
                      <strong>{exercise.name}</strong>
                      <small>{exercise.sets.length} × {exercise.sets[0]?.targetReps} · {exercise.sets[0]?.intensity}{exercise.note ? ` · ${exercise.note}` : ""}</small>
                    </span>
                  </button>
                ))}
                {prepDone < prepExercises.length && <button className="prep-mark-all" onClick={markAllPrepDone}>Mark all prep done</button>}
              </div>
            )}
          </div>
        )}
        <ExerciseList
          exercises={state.todaySession.exercises}
          expandedExercise={expandedExercise}
          expandedSetId={expandedSetId}
          activeTrainingLocation={state.activeTrainingLocation}
          setExpandedExercise={setExpandedExercise}
          setExpandedSetId={setExpandedSetId}
          updateExerciseSet={updateExerciseSet}
          addExerciseSet={addExerciseSet}
          removeLastExerciseSet={removeLastExerciseSet}
          updateExerciseNextNote={updateExerciseNextNote}
        />
      </div>
      {restSeconds > 0 && (
        <div className="rest-chip">
          <button className="rest-circle" onClick={() => setRestPaused(!restPaused)} aria-label={restPaused ? "Resume rest" : "Pause rest"}>
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="32" fill="var(--paper)" stroke="rgba(42, 51, 41, 0.12)" strokeWidth="3" />
              <circle
                cx="40"
                cy="40"
                r="32"
                fill="none"
                stroke="var(--brass)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={restCircumference}
                strokeDashoffset={restOffset}
                transform="rotate(-90 40 40)"
              />
              <text x="40" y="38" textAnchor="middle">{minutes}:{String(seconds).padStart(2, "0")}</text>
              <text x="40" y="51" textAnchor="middle" className="rest-label">{restPaused ? "Paused" : "Rest"}</text>
            </svg>
          </button>
          <div className="rest-controls">
            <button onClick={() => setRestSeconds((value) => Math.max(0, value - 15))}>−15</button>
            <button onClick={() => setRestSeconds((value) => value + 15)}>+15</button>
          </div>
          <button className="rest-skip" onClick={() => setRestSeconds(0)}>Skip</button>
        </div>
      )}
      <div className="session-cta">
        <button onClick={finishWorkout}>Finish workout</button>
        <button onClick={() => { setRestSeconds(0); close(); }}>Save · close</button>
      </div>
    </div>
  );
}

function PulseOverlay({ state, close }: { state: KuzuriState; close: () => void }) {
  const week = [73, 62, 81, 58, 66, 0, 0];
  return (
    <div className="pulse-screen">
      <div className="pulse-top">
        <button onClick={close}>‹ Today</button>
        <button className="dark-close" onClick={close} aria-label="Close">×</button>
      </div>
      <div className="pulse-kicker">Pulse · Today</div>
      <h2>The body, listening.</h2>
      <div className="pulse-source"><i />Whoop · last synced just now</div>

      <div className="pulse-card">
        <div className="pulse-card-head">
          <span>Slept</span>
          <em>via Whoop</em>
        </div>
        <div className="sleep-total">7h 24m</div>
        <div className="sleep-bar">
          <span style={{ width: "10%", background: "#5A544A" }} />
          <span style={{ width: "49%", background: "#4E7A62" }} />
          <span style={{ width: "23%", background: "#2E5B45" }} />
          <span style={{ width: "18%", background: "#C99B62" }} />
        </div>
        <div className="sleep-stages">
          <div><span>● awake</span><strong>48m</strong></div>
          <div><span>● light</span><strong>3h 59m</strong></div>
          <div><span>● deep</span><strong>1h 55m</strong></div>
          <div><span>● rem</span><strong>1h 30m</strong></div>
        </div>
        <p>Sleep performance · <b>90%</b> · enough.</p>
      </div>

      <div className="pulse-card">
        <div className="pulse-card-head"><span>Recovery</span></div>
        <div className="recovery-row">
          <div>
            <h3>Tender.</h3>
            <em>HRV 44 · resting 57 bpm</em>
            <p>a body that needs care</p>
          </div>
          <div className="recovery-ring">
            <svg width="96" height="96" viewBox="0 0 96 96">
              <circle cx="48" cy="48" r="40" fill="none" stroke="#2C271E" strokeWidth="6" />
              <circle cx="48" cy="48" r="40" fill="none" stroke="#C99B62" strokeWidth="6" strokeLinecap="round" strokeDasharray="251.3" strokeDashoffset="85.4" transform="rotate(-90 48 48)" />
            </svg>
            <span>66</span>
          </div>
        </div>
        <div className="past-label">Past 7 Days</div>
        <div className="recovery-week">
          {week.map((value, index) => (
            <div key={`${value}-${index}`}>
              <span style={{ background: value ? recoveryColor(value) : "transparent", border: value ? "1px solid transparent" : "2px solid #C99B62" }} />
              <em>{value || 66}</em>
              <small>{["W", "T", "F", "S", "S", "M", "T"][index]}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="body-work">Body × Work</div>
      <p className="whispers">What the data whispers, lately.</p>
      <div className="correlation-stack">
        {["7 h+ sleep -> +6% lifting volume", "Red recovery days -> cut strain, not pace", "HRV rising -> easy pace 12 s/km faster"].map((line) => (
          <div className="correlation-card" key={line}>
            <div>
              <h3>{line.split(" -> ")[0]}</h3>
              <p>{line.includes("sleep") ? "nights over 7 h precede your bigger sessions" : line.includes("Red") ? "you push hardest on red days — backwards" : "three weeks of rising HRV, quicker easy pace"}</p>
            </div>
            <svg width="88" height="40" viewBox="0 0 88 40">
              <polyline points="2,30 16,26 30,28 44,18 58,20 72,10 86,12" fill="none" stroke="#5F9678" strokeWidth="2" strokeLinecap="round" />
              <polyline points="2,34 16,32 30,33 44,26 58,27 72,20 86,21" fill="none" stroke="#C99B62" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 4" />
            </svg>
            <strong>{line.split(" -> ")[1]}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function recoveryColor(value: number) {
  if (value < 34) return "#B4593B";
  if (value < 67) return "#C99B62";
  return "#4E7A62";
}

function QuickOverlay({
  openOverlay,
  setState
}: {
  openOverlay: (overlay: OverlayId) => void;
  setState: React.Dispatch<React.SetStateAction<KuzuriState>>;
}) {
  return (
    <div className="grid-2">
      <button className="action" onClick={() => openOverlay("location")}><Dumbbell /> Workout</button>
      <button className="action" onClick={() => openOverlay("meal")}><Utensils /> Fuel</button>
      <button className="action" onClick={() => setState((current) => ({ ...current, selectedTab: "mind", selectedOverlay: null, learningTimerRunning: true }))}><Timer /> Learn</button>
      <button className="action" onClick={() => openOverlay("day")}><History /> History</button>
    </div>
  );
}

function LocationOverlay({
  state,
  selectTrainingLocation
}: {
  state: KuzuriState;
  selectTrainingLocation: (location: TrainingLocation) => void;
}) {
  const firstWorkExercise = state.todaySession.exercises.find((exercise) => !exercise.prep);
  return (
    <div className="location-picker">
      <div className="location-session">
        <span className="eyebrow">Starting</span>
        <h3>{state.todaySession.title}</h3>
        <p>Machine memory stays separate by country.</p>
      </div>
      <div className="location-options">
        {trainingLocations.map((location) => {
          const lastSets = firstWorkExercise?.lastSetsByLocation?.[location] ?? firstWorkExercise?.lastSets;
          const lastLine = lastSets?.filter(Boolean).map((set) => `${set?.weight}×${set?.reps ?? ""}`).join(", ") || "no local history yet";
          const selected = state.activeTrainingLocation === location;
          return (
            <button
              className={`location-option ${selected ? "active" : ""}`}
              key={location}
              onClick={() => selectTrainingLocation(location)}
            >
              <span>{location}</span>
              <strong>{firstWorkExercise?.name}</strong>
              <em>last here: {lastLine}</em>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CoachOverlay({
  state,
  setState
}: {
  state: KuzuriState;
  setState: React.Dispatch<React.SetStateAction<KuzuriState>>;
}) {
  return (
    <div className="list">
      <div className="card panel">
        <span className="eyebrow">Proposal</span>
        <h3>Trade intervals for zone 2</h3>
        <p className="subtle">Recovery is 66 and sleep was 7h 24m. This keeps aerobic work while lowering strain.</p>
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <button className="primary-button">Accept</button>
          <button className="ghost-button">Set aside</button>
        </div>
      </div>
      {Object.entries(state.coachPrefs).map(([key, value]) => (
        <div className="conn-row" key={key}>
          <div>
            <strong>{key}</strong>
            <p className="subtle">Consent controlled. Nothing moves without your rule.</p>
          </div>
          <button
            className={`toggle ${value ? "on" : ""}`}
            onClick={() =>
              setState((current) => ({
                ...current,
                coachPrefs: { ...current.coachPrefs, [key]: !value }
              }))
            }
            aria-label={`Toggle ${key}`}
          />
        </div>
      ))}
    </div>
  );
}

function BuilderOverlay({
  state,
  setState,
  close
}: {
  state: KuzuriState;
  setState: React.Dispatch<React.SetStateAction<KuzuriState>>;
  close: () => void;
}) {
  const activeSplit = state.splitPlan.splits.find((split) => split.id === state.splitPlan.activeSplitId) ?? initialState.splitPlan.splits[0];
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [customExercise, setCustomExercise] = useState("");
  const editingWorkout = activeSplit.workouts.find((workout) => workout.id === editingWorkoutId) ?? null;
  const workoutTemplates: Array<Pick<SplitWorkout, "name" | "focus"> & { exercises: string[] }> = [
    { name: "Push", focus: "favorites: bench press, deadlift", exercises: ["Bench Press", "Deadlift"] },
    { name: "Pull", focus: "favorites: pullover, row", exercises: ["pullover"] },
    { name: "Legs", focus: "favorites: hip thrust, back squat", exercises: ["Hip Thrust", "Back Squat"] },
    { name: "Full body", focus: "whole body strength", exercises: ["Bench Press", "Back Squat"] },
    { name: "Blank", focus: "write it yourself", exercises: [] }
  ];
  const exerciseChips = ["Bench Press", "Back Squat", "Deadlift", "Overhead Press", "Pull-ups", "Barbell Row", "Hip Thrust", "Lateral Raises", "Leg Press", "Romanian Deadlift"];

  function updateSplit(patch: Partial<{ name: string; cadence: string }>) {
    setState((current) => ({
      ...current,
      splitPlan: {
        ...current.splitPlan,
        splits: current.splitPlan.splits.map((split) =>
          split.id === activeSplit.id ? { ...split, ...patch } : split
        )
      },
      todaySession: patch.name ? { ...current.todaySession, program: patch.name } : current.todaySession
    }));
  }

  function updateWorkout(workoutId: string, patch: Partial<SplitWorkout>) {
    setState((current) => ({
      ...current,
      splitPlan: {
        ...current.splitPlan,
        splits: current.splitPlan.splits.map((split) =>
          split.id !== activeSplit.id
            ? split
            : {
                ...split,
                workouts: split.workouts.map((workout) =>
                  workout.id === workoutId ? { ...workout, ...patch } : workout
                )
              }
        )
      },
      todaySession:
        current.splitPlan.splits.find((split) => split.id === activeSplit.id)?.nextWorkoutId === workoutId && patch.name
          ? { ...current.todaySession, title: patch.name }
          : current.todaySession
    }));
  }

  function reorderWorkout(workoutId: string, direction: -1 | 1) {
    setState((current) => ({
      ...current,
      splitPlan: {
        ...current.splitPlan,
        splits: current.splitPlan.splits.map((split) => {
          if (split.id !== activeSplit.id) return split;
          const from = split.workouts.findIndex((workout) => workout.id === workoutId);
          return { ...split, workouts: moveItem(split.workouts, from, from + direction) };
        })
      }
    }));
  }

  function addWorkoutFromTemplate(template: Pick<SplitWorkout, "name" | "focus"> & { exercises: string[] }) {
    const id = `${template.name.toLowerCase().replace(/\s+/g, "-")}-${crypto.randomUUID()}`;
    setState((current) => ({
      ...current,
      splitPlan: {
        ...current.splitPlan,
        splits: current.splitPlan.splits.map((split) =>
          split.id !== activeSplit.id
            ? split
            : {
                ...split,
                nextWorkoutId: split.nextWorkoutId || id,
                workouts: [
                  ...split.workouts,
                  {
                    id,
                    name: template.name,
                    focus: template.focus,
                    lastPerformed: "tap the name to rename it",
                    estimatedMinutes: 45,
                    exercises: template.exercises.map(splitExercise)
                  }
                ]
              }
        )
      }
    }));
    setEditingWorkoutId(id);
  }

  function clearSplit() {
    setState((current) => ({
      ...current,
      splitPlan: {
        ...current.splitPlan,
        splits: current.splitPlan.splits.map((split) =>
          split.id === activeSplit.id ? { ...split, nextWorkoutId: "", workouts: [] } : split
        )
      }
    }));
    setEditingWorkoutId(null);
  }

  function addExerciseToWorkout(workoutId: string, exerciseName: string) {
    if (!exerciseName.trim()) return;
    const name = exerciseName.trim();
    updateWorkout(workoutId, {
      exercises: [...(activeSplit.workouts.find((workout) => workout.id === workoutId)?.exercises ?? []), splitExercise(name)]
    });
  }

  function updateSplitExercise(workoutId: string, exerciseId: string, patch: Partial<SplitExercise>) {
    const workout = activeSplit.workouts.find((item) => item.id === workoutId);
    if (!workout) return;
    updateWorkout(workoutId, {
      exercises: workout.exercises.map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, ...patch } : exercise
      )
    });
  }

  function reorderExercise(workoutId: string, exerciseIndex: number, direction: -1 | 1) {
    const workout = activeSplit.workouts.find((item) => item.id === workoutId);
    if (!workout) return;
    updateWorkout(workoutId, {
      exercises: moveItem(workout.exercises, exerciseIndex, exerciseIndex + direction)
    });
  }

  function removeWorkout(workoutId: string) {
    setState((current) => ({
      ...current,
      splitPlan: {
        ...current.splitPlan,
        splits: current.splitPlan.splits.map((split) => {
          if (split.id !== activeSplit.id) return split;
          const workouts = split.workouts.filter((workout) => workout.id !== workoutId);
          return {
            ...split,
            workouts,
            nextWorkoutId: split.nextWorkoutId === workoutId ? workouts[0]?.id ?? "" : split.nextWorkoutId
          };
        })
      }
    }));
    setEditingWorkoutId(null);
  }

  if (editingWorkout) {
    return (
      <div className="split-builder-screen">
        <div className="builder-nav-row">
          <button onClick={() => setEditingWorkoutId(null)}>‹ Split</button>
          <button className="builder-close" onClick={close} aria-label="Close">×</button>
        </div>
        <div className="builder-edit-body">
          <span className="builder-kicker">Edit workout</span>
          <input
            className="builder-title-input"
            aria-label="Workout name"
            value={editingWorkout.name}
            onChange={(event) => updateWorkout(editingWorkout.id, { name: event.target.value })}
          />
          <div className="builder-workout-meta">
            <span>{editingWorkout.lastPerformed}</span>
            <span>{editingWorkout.exercises.length} exercises</span>
            <span>{editingWorkout.exercises.reduce((sum, exercise) => sum + exercise.sets, 0)} sets total</span>
          </div>
          <span className="builder-kicker lower">Exercises</span>
          <div className="builder-exercise-rows">
            {editingWorkout.exercises.map((exercise, index) => (
              <div className="builder-exercise-row" key={exercise.id}>
                <div className="builder-row-order">
                  <button onClick={() => reorderExercise(editingWorkout.id, index, -1)} disabled={index === 0} aria-label={`Move ${exercise.name} up`}>↑</button>
                  <button onClick={() => reorderExercise(editingWorkout.id, index, 1)} disabled={index === editingWorkout.exercises.length - 1} aria-label={`Move ${exercise.name} down`}>↓</button>
                </div>
                <span>{exercise.name}</span>
                <input
                  aria-label={`${exercise.name} sets`}
                  inputMode="numeric"
                  value={exercise.sets}
                  onChange={(event) => updateSplitExercise(editingWorkout.id, exercise.id, { sets: Math.max(1, Number(event.target.value) || 1) })}
                />
                <input
                  aria-label={`${exercise.name} rep range`}
                  value={exercise.repRange}
                  onChange={(event) => updateSplitExercise(editingWorkout.id, exercise.id, { repRange: event.target.value })}
                />
                <button
                  onClick={() =>
                    updateWorkout(editingWorkout.id, {
                      exercises: editingWorkout.exercises.filter((item) => item.id !== exercise.id)
                    })
                  }
                  aria-label={`Remove ${exercise.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <span className="builder-kicker lower">Add an exercise</span>
          <div className="builder-chip-grid">
            {exerciseChips.map((exercise) => (
              <button key={exercise} onClick={() => addExerciseToWorkout(editingWorkout.id, exercise)}>
                + {exercise}
              </button>
            ))}
          </div>
          <div className="builder-custom-add">
            <input
              aria-label="Custom exercise"
              placeholder="Or type your own -- e.g. Nordic"
              value={customExercise}
              onChange={(event) => setCustomExercise(event.target.value)}
            />
            <button
              onClick={() => {
                addExerciseToWorkout(editingWorkout.id, customExercise);
                setCustomExercise("");
              }}
              aria-label="Add custom exercise"
            >
              +
            </button>
          </div>
          <p className="builder-footnote">Weights and reps carry over from your last time on each lift.</p>
          <div className="builder-bottom-actions">
            <button onClick={() => setEditingWorkoutId(null)}>Done</button>
            <button onClick={() => removeWorkout(editingWorkout.id)}>Remove workout</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="split-builder-screen">
      <div className="builder-nav-row">
        <button onClick={close}>‹ Train</button>
        <button className="builder-close" onClick={close} aria-label="Close">×</button>
      </div>
      <div className="builder-edit-body">
        <span className="builder-kicker">Your split</span>
        <input
          className="builder-title-input"
          aria-label="Split name"
          value={activeSplit.name}
          onChange={(event) => updateSplit({ name: event.target.value })}
        />
        <textarea
          className="builder-subtitle-input"
          aria-label="Split description"
          value={activeSplit.cadence}
          onChange={(event) => updateSplit({ cadence: event.target.value })}
        />
        {activeSplit.workouts.length > 0 && (
          <div className="builder-day-cards">
            {activeSplit.workouts.map((workout, index) => (
              <div className="builder-day-card" key={workout.id}>
                <button className="builder-day-main" onClick={() => setEditingWorkoutId(workout.id)}>
                  <div>
                    <strong>{workout.name}</strong>
                    <span>{workout.focus}</span>
                  </div>
                  <em>edit</em>
                </button>
                <div className="builder-day-order">
                  <button onClick={() => reorderWorkout(workout.id, -1)} disabled={index === 0} aria-label={`Move ${workout.name} earlier`}>↑</button>
                  <button onClick={() => reorderWorkout(workout.id, 1)} disabled={index === activeSplit.workouts.length - 1} aria-label={`Move ${workout.name} later`}>↓</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <span className="builder-kicker lower">Add a day</span>
        <div className="builder-chip-grid compact">
          {workoutTemplates.map((template) => (
            <button key={template.name} onClick={() => addWorkoutFromTemplate(template)}>
              + {template.name}
            </button>
          ))}
        </div>
        <p className="builder-footnote">The coach will draft a new day with exercises -- for your split.</p>
        <button className="builder-scratch-card" onClick={clearSplit}>
          <strong>Start from scratch</strong>
          <span>clear the week, keep the history -- then build your own</span>
        </button>
        <button className="builder-done-wide" onClick={close}>Done</button>
      </div>
    </div>
  );
}

function GoalsOverlay({
  state,
  setState
}: {
  state: KuzuriState;
  setState: React.Dispatch<React.SetStateAction<KuzuriState>>;
}) {
  const rows = [
    ["kcal", "Calories", 50],
    ["protein", "Protein", 5],
    ["carbs", "Carbs", 5],
    ["fat", "Fat", 5]
  ] as const;
  return (
    <div className="list">
      {rows.map(([key, label, step]) => (
        <div className="card panel" key={key}>
          <div className="metric-row">
            <div>
              <span className="eyebrow">{label}</span>
              <h3>{state.macroGoals[key]}</h3>
            </div>
            <Stepper
              value={String(state.macroGoals[key])}
              decrement={() => setState((current) => ({ ...current, macroGoals: { ...current.macroGoals, [key]: Math.max(0, current.macroGoals[key] - step) } }))}
              increment={() => setState((current) => ({ ...current, macroGoals: { ...current.macroGoals, [key]: current.macroGoals[key] + step } }))}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function SealsOverlay({ state }: { state: KuzuriState }) {
  return (
    <div className="list">
      <div className="card panel">
        <span className="eyebrow">Rank IV</span>
        <h3>The Disciplined</h3>
        <p className="subtle">{state.seals.filter((seal) => seal.status === "earned").length} of {state.seals.length} seals held</p>
      </div>
      <div className="seal-grid">
        {state.seals.map((seal) => (
          <div className={`card seal ${seal.status}`} key={seal.id}>
            <div className="seal-mark">{seal.title.slice(0, 1)}</div>
            <div>
              <span className="eyebrow">{seal.group}</span>
              <strong>{seal.title}</strong>
              <p className="subtle">{seal.description}</p>
              {seal.status === "progress" && <div className="bar-track"><div className="bar-fill" style={{ width: `${seal.progress}%` }} /></div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MeOverlay({
  state,
  setState,
  openOverlay
}: {
  state: KuzuriState;
  setState: React.Dispatch<React.SetStateAction<KuzuriState>>;
  openOverlay: (overlay: OverlayId) => void;
}) {
  return (
    <div className="list">
      <div className="card panel">
        <span className="eyebrow">Profile</span>
        <h3>{state.user.name}</h3>
        <p className="subtle">{state.user.identity}</p>
        <p className="subtle">{state.dayLogs[4].weightKg} kg · {state.user.heightCm} cm · born {state.user.birthYear}</p>
      </div>
      <div className="card panel">
        <span className="eyebrow">Connections</span>
        {Object.entries(state.connections).map(([key, value]) => (
          <div className="conn-row" key={key}>
            <div>
              <strong>{connectionLabel(key)}</strong>
              <p className="subtle">{value ? "live-synced" : "not connected"}</p>
            </div>
            <button
              className={`toggle ${value ? "on" : ""}`}
              onClick={() =>
                setState((current) => ({
                  ...current,
                  connections: { ...current.connections, [key]: !value }
                }))
              }
              aria-label={`Toggle ${key}`}
            />
          </div>
        ))}
      </div>
      <div className="grid-2">
        <button className="action" onClick={() => openOverlay("goals")}><Flame /> Macro targets</button>
        <button className="action" onClick={() => openOverlay("builder")}><Dumbbell /> Split builder</button>
      </div>
      <div className="card panel">
        <span className="eyebrow">Your data</span>
        <div className="meal-row"><strong>Export everything</strong><ChevronRight /></div>
        <div className="meal-row"><strong>Delete everything</strong><ChevronRight /></div>
      </div>
    </div>
  );
}

function DayOverlay({
  day,
  index,
  state,
  setState,
  close
}: {
  day: KuzuriState["dayLogs"][number];
  index: number;
  state: KuzuriState;
  setState: React.Dispatch<React.SetStateAction<KuzuriState>>;
  close: () => void;
}) {
  const todayIndex = 4;
  const future = index > todayIndex;
  const dayNames = [
    "Monday · 27 Jul",
    "Tuesday · 28 Jul",
    "Wednesday · 29 Jul",
    "Thursday · 30 Jul",
    "Friday · 31 Jul · today",
    "Saturday · 1 Aug",
    "Sunday · 2 Aug"
  ];
  const dateNumbers = [27, 28, 29, 30, 31, 1, 2];
  const dayLetters = ["M", "T", "W", "T", "F", "S", "S"];
  const meals = index === todayIndex ? state.meals : day.meals;
  const learning = day.learning;
  const kcal = meals.reduce((sum, meal) => sum + meal.kcal, 0);
  const learnedMinutes = learning.reduce((sum, item) => sum + item.minutes, 0);
  const recovery = future ? 0 : day.recovery;
  const recoveryTone = recovery < 34 ? "Wrecked." : recovery < 67 ? "Tender." : "Primed.";
  const recoveryColor = recovery < 34 ? "#b4593b" : recovery < 67 ? "#c99b62" : "#5f9678";
  const workoutName = future ? "Planned" : (day.workout?.split(" · ")[0] ?? "No lift");
  const workoutSets = future ? 0 : Number(day.workout?.match(/(\d+) sets/)?.[1] ?? (index === todayIndex ? totalLoggedSets(state) : 0));
  const workoutMeta = future
    ? "nothing logged"
    : day.workout
      ? day.workout.split(" · ").slice(1).join(" · ") || `${workoutSets} sets`
      : "the bar waited";
  const runTitle = future ? "No run" : day.run?.match(/([\d.]+ km)/)?.[1] ?? "No run";
  const runMeta = future ? "not written" : day.run ? day.run.split(" · ")[0] : "legs saved";
  const learnedTitle = `${learnedMinutes}m`;
  const learnedMeta = learning.length ? [...new Set(learning.map((item) => item.domain))].join(" · ") : "not started";
  const story = future
    ? "Nothing logged yet."
    : recovery < 34
      ? "A red morning — the day asked for less, and got it."
      : day.run
        ? "The road took its share; the kitchen gave it back."
        : day.workout && recovery >= 67
          ? "Strong, fed and recovered — a day well spent."
          : "Quiet and steady — the thread held.";

  return (
    <div className="looking-back-screen">
      <div className="looking-back-kicker">LOOKING BACK</div>
      <h1>{dayNames[index] ?? day.label}</h1>

      <div className="looking-back-week">
        {dayLetters.map((letter, dayIndex) => (
          <button
            className={`looking-back-day ${dayIndex === index ? "active" : ""} ${dayIndex === todayIndex ? "today" : ""} ${dayIndex > todayIndex ? "future" : ""}`}
            key={`${letter}-${dateNumbers[dayIndex]}`}
            onClick={() => setState((current) => ({ ...current, selectedDayIndex: dayIndex }))}
          >
            <span>{letter}</span>
            <strong>{dateNumbers[dayIndex]}</strong>
            <em>{dayIndex === 0 ? "★" : ""}</em>
          </button>
        ))}
      </div>

      <div className="looking-body-card">
        <div className="looking-recovery-ring" style={{ "--recovery": `${recovery}%`, "--recovery-color": recoveryColor } as React.CSSProperties}>
          <strong>{future ? "" : recovery}</strong>
        </div>
        <div className="looking-body-copy">
          <span>THE BODY</span>
          <h2>{future ? "Unwritten." : recoveryTone}</h2>
          <p>{future ? "no sleep logged yet" : `slept ${day.sleep.replace(" ", "")} · via Whoop`}</p>
          <div className="looking-sleep-bar"><i /><i /><i /><i /></div>
        </div>
      </div>

      <div className="looking-tile-grid">
        <article className="looking-tile trained">
          <span>TRAINED</span>
          <h3>{workoutName}</h3>
          <div className="looking-set-grid">
            {Array.from({ length: Math.max(8, workoutSets) }).map((_, setIndex) => (
              <i key={setIndex} style={{ opacity: setIndex < workoutSets ? 1 : 0.22 }} />
            ))}
          </div>
          <p>{workoutMeta}</p>
        </article>

        <article className="looking-tile ran">
          <span>RAN</span>
          <h3>{runTitle}</h3>
          <div className="looking-run-line" />
          <p>{runMeta}</p>
        </article>

        <article className="looking-tile ate">
          <div className="looking-ate-ring" />
          <span>ATE</span>
          <h3>{kcal} kcal</h3>
          <p>{meals.length} {meals.length === 1 ? "meal" : "meals"} · target {state.macroGoals.kcal}</p>
        </article>

        <article className="looking-tile learned">
          <span>LEARNED</span>
          <h3>{learnedTitle}</h3>
          <p>{learnedMeta}</p>
        </article>
      </div>

      <div className="looking-weight-card">
        <div>
          <span>WEIGHED</span>
          <strong>{future ? "—" : `${day.weightKg} kg`}</strong>
        </div>
        <p>{story}</p>
      </div>

      <button className="looking-done" onClick={close}>Done correcting</button>

      {!future && (
        <div className="looking-bottom-peek">
          {workoutName !== "No lift" ? `${workoutName} · the session` : `${dayNames[index]?.split(" · ")[0]} · the record`}
        </div>
      )}
    </div>
  );
}

function totalLoggedSets(state: KuzuriState) {
  return state.todaySession.exercises.reduce((count, exercise) => count + (exercise.prep ? 0 : exercise.sets.length), 0);
}

function EditableLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="card panel">
      <span className="eyebrow">{label}</span>
      <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
        <strong>{value}</strong>
        <button className="plain-button">edit</button>
      </div>
    </div>
  );
}

function overlayTitle(overlay: OverlayId) {
  const labels: Record<OverlayId, string> = {
    pulse: "Pulse",
    session: "Workout",
    location: "Train where?",
    quick: "Quick log",
    coach: "Coach",
    builder: "Split builder",
    meal: "Log fuel",
    goals: "Targets",
    seals: "Seals",
    me: "Me",
    day: "Looking back"
  };
  return labels[overlay];
}

function connectionLabel(key: string) {
  const labels: Record<string, string> = {
    whoop: "Whoop",
    strava: "Strava",
    runna: "Runna",
    appleHealth: "Apple Health"
  };
  return labels[key] ?? key;
}
