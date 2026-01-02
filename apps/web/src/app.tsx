import { Sidebar, ThreadList, SessionView, AnalyticsView } from './components'
import { StartupLoader } from './components/loading/startup-loader'
import { MobileHeader } from './components/layout/mobile-header'
import { MobileDrawer } from './components/ui'
import { useHubConnection } from './hooks/use-hub-connection'
import { useThreadHistory } from './hooks/use-thread-history'
import { useIsMobile, useDynamicViewportHeight } from './hooks/use-mobile'
import { useAppStore } from './store'

function App() {
  useHubConnection()
  useThreadHistory()
  useDynamicViewportHeight()
  
  const isMobile = useIsMobile()
  const { 
    isMobileSidebarOpen, 
    isMobileThreadListOpen,
    setMobileSidebarOpen,
    setMobileThreadListOpen,
    closeMobileDrawers,
    setSelectedThreadId,
    showAnalytics,
  } = useAppStore()

  const handleThreadSelect = (threadId: string) => {
    if (threadId) {
      setSelectedThreadId(threadId)
    }
    closeMobileDrawers()
  }

  if (isMobile) {
    return (
      <div 
        className="flex flex-col overflow-hidden bg-bg-primary"
        style={{ height: 'calc(var(--vh, 1vh) * 100)' }}
      >
        <StartupLoader />
        
        <MobileHeader />
        
        {showAnalytics ? <AnalyticsView /> : <SessionView />}
        
        <MobileDrawer 
          open={isMobileSidebarOpen} 
          onClose={() => setMobileSidebarOpen(false)}
          side="left"
        >
          <Sidebar onNavigate={() => setMobileSidebarOpen(false)} />
        </MobileDrawer>
        
        <MobileDrawer 
          open={isMobileThreadListOpen} 
          onClose={() => setMobileThreadListOpen(false)}
          side="right"
        >
          <ThreadList onThreadSelect={handleThreadSelect} />
        </MobileDrawer>
      </div>
    )
  }

  return (
    <div className="h-screen flex overflow-hidden bg-bg-primary">
      <StartupLoader />
      <Sidebar />
      {showAnalytics ? (
        <AnalyticsView />
      ) : (
        <>
          <ThreadList />
          <SessionView />
        </>
      )}
    </div>
  )
}

export default App
