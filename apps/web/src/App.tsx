import { Routes, Route } from 'react-router-dom'

function Home() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-gray-900">TicketZilla</h1>
        <p className="mt-3 text-gray-500">IT Help Desk — Phase 1</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  )
}
