import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './routes/AppRoutes';
import { AppToaster } from './components/common/Toast';
import { ConfirmDialogProvider } from './components/common/ConfirmDialog';
import { VesselProvider } from './contexts/VesselContext';
import { I18nProvider } from './contexts/I18nContext';
import { AuthProvider } from './contexts/AuthContext';
import './styles/variables.css';
import './styles/common.css';
import './styles/global.css';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <I18nProvider>
          <VesselProvider>
            <ConfirmDialogProvider>
              <AppRoutes />
              <AppToaster />
            </ConfirmDialogProvider>
          </VesselProvider>
        </I18nProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
