import Navbar from "../components/Navbar"
import PlanningView from "../components/PlanningView"

export default function PlanningPage() {
  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "#f0ebe2" }}>
      <Navbar />
      <PlanningView />
    </div>
  )
}
