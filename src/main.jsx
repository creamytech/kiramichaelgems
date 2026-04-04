import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("App crash:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding:40,fontFamily:"Georgia,serif",textAlign:"center",color:"#2A2118"}}>
          <h2 style={{color:"#C0392B"}}>Something went wrong</h2>
          <pre style={{textAlign:"left",background:"#FAF8F4",padding:16,borderRadius:8,overflow:"auto",fontSize:13,maxWidth:600,margin:"16px auto"}}>
            {this.state.error?.toString()}
          </pre>
          <button onClick={()=>window.location.reload()} style={{marginTop:16,padding:"10px 24px",background:"#A8872A",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:15}}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
