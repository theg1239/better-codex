import { Sidebar, ThreadList, SessionView } from './components'
import { StartupLoader } from './components/loading/startup-loader'
import { useHubConnection } from './hooks/use-hub-connection'
import { useThreadHistory } from './hooks/use-thread-history'

function App() {
  useHubConnection()
  useThreadHistory()

  return (
    <div className="h-screen flex overflow-hidden bg-bg-primary">
      <StartupLoader />
      <Sidebar />
      <ThreadList />
      <SessionView />
    </div>
  )
}

export default App
