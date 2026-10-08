import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { useSettingsStore } from '@/store/useSettingsStore'
import { applySettingsToDom } from '@/lib/utils'
import Dashboard from '@/pages/Dashboard'
import Subjects from '@/pages/Subjects'
import SubjectView from '@/pages/SubjectView'
import LessonView from '@/pages/LessonView'
import Library from '@/pages/Library'
import Reader from '@/pages/Reader'
import Tutor from '@/pages/Tutor'
import Quiz from '@/pages/Quiz'
import Exam from '@/pages/Exam'
import Aptitude from '@/pages/Aptitude'
import Notes from '@/pages/Notes'
import Progress from '@/pages/Progress'
import SearchPage from '@/pages/Search'
import Admin from '@/pages/Admin'
import Settings from '@/pages/Settings'
import About from '@/pages/About'

export default function App(): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)

  // Re-apply theme when the OS appearance changes and the user is on "system".
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (): void => {
      if (useSettingsStore.getState().settings.theme === 'system') {
        applySettingsToDom(useSettingsStore.getState().settings)
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [settings.theme])

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/subjects" element={<Subjects />} />
        <Route path="/subject/:grade/:subjectKey" element={<SubjectView />} />
        <Route path="/lesson/:id" element={<LessonView />} />
        <Route path="/library" element={<Library />} />
        <Route path="/reader/:bookId" element={<Reader />} />
        <Route path="/tutor" element={<Tutor />} />
        <Route path="/quiz" element={<Quiz />} />
        <Route path="/exam" element={<Exam />} />
        <Route path="/aptitude" element={<Aptitude />} />
        <Route path="/notes" element={<Notes />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/about" element={<About />} />
      </Route>
    </Routes>
  )
}
