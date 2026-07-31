'use client';

import { useState } from 'react';
import DemoShell, { type DemoScreen, type DemoTheme } from './DemoShell';
import DemoDashboard from './DemoDashboard';
import DemoPatients from './DemoPatients';
import DemoExam from './DemoExam';

const TITLES: Record<DemoScreen, string> = {
  dashboard: 'Today',
  patients: 'Patients',
  exam: 'Exam',
};

export default function DesignPage() {
  const [screen, setScreen] = useState<DemoScreen>('dashboard');
  const [theme, setTheme] = useState<DemoTheme>('paper');

  return (
    <DemoShell
      screen={screen}
      onScreenChange={setScreen}
      theme={theme}
      onThemeChange={setTheme}
      title={TITLES[screen]}
    >
      {screen === 'dashboard' && <DemoDashboard />}
      {screen === 'patients' && <DemoPatients />}
      {screen === 'exam' && <DemoExam />}
    </DemoShell>
  );
}
