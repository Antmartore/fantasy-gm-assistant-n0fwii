import React, { useEffect, useState } from 'react';
import { Provider } from 'react-redux'; // ^8.0.0
import { configureStore } from '@reduxjs/toolkit'; // ^1.9.0
import createSagaMiddleware from 'redux-saga'; // ^1.2.1
import { ThemeProvider } from '@shopify/restyle'; // ^2.4.0
import { ErrorBoundary } from 'react-error-boundary'; // ^4.0.0
import { initializeApp, getApp, getApps } from 'firebase/app'; // ^9.0.0
import { enableIndexedDbPersistence } from 'firebase/firestore'; // ^9.0.0
import { Analytics, getAnalytics } from 'firebase/analytics'; // ^9.0.0

// Internal imports
import AppNavigator from './navigation/AppNavigator';
import rootReducer from './store/reducers';
import rootSaga from './store/sagas';
import { theme } from './config/theme';
import { useAnalytics } from './hooks/useAnalytics';

// Create saga middleware with monitoring in development
const sagaMiddleware = createSagaMiddleware({
  sagaMonitor: process.env.NODE_ENV === 'development' 
    ? console.tron?.createSagaMonitor() 
    : null
});

// Configure Redux store with middleware
const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) => 
    getDefaultMiddleware({
      thunk: false,
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE']
      }
    }).concat(sagaMiddleware),
  devTools: process.env.NODE_ENV !== 'production'
});

// Error fallback component
const ErrorFallback: React.FC<{ error: Error; resetErrorBoundary: () => void }> = ({
  error,
  resetErrorBoundary
}) => (
  <div role="alert" style={{ padding: '20px', textAlign: 'center' }}>
    <h2>Something went wrong</h2>
    <pre style={{ color: 'red' }}>{error.message}</pre>
    <button onClick={resetErrorBoundary}>Try again</button>
  </div>
);

const App: React.FC = () => {
  const [initialized, setInitialized] = useState(false);
  const { trackError } = useAnalytics();
  
  // Initialize Firebase and other services
  useEffect(() => {
    const initializeServices = async () => {
      try {
        // Initialize Firebase if not already initialized
        if (!getApps().length) {
          const firebaseConfig = {
            apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
            authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
            projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
            storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.REACT_APP_FIREBASE_APP_ID,
            measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
          };

          const app = initializeApp(firebaseConfig);

          // Enable offline persistence
          if (process.env.NODE_ENV === 'production') {
            try {
              await enableIndexedDbPersistence(getFirestore(app));
            } catch (error) {
              console.error('Failed to enable offline persistence:', error);
            }
          }

          // Initialize analytics in production
          if (process.env.NODE_ENV === 'production') {
            getAnalytics(app);
          }
        }

        // Start root saga
        sagaMiddleware.run(rootSaga);
        
        setInitialized(true);
      } catch (error) {
        trackError(error as Error, 'App Initialization Error');
        console.error('Failed to initialize app:', error);
      }
    };

    initializeServices();

    // Cleanup on unmount
    return () => {
      // Cleanup any subscriptions or listeners here
    };
  }, [trackError]);

  if (!initialized) {
    return null; // Or a loading spinner
  }

  return (
    <React.StrictMode>
      <ErrorBoundary
        FallbackComponent={ErrorFallback}
        onError={(error) => {
          trackError(error, 'App Error Boundary');
          console.error('App Error:', error);
        }}
        onReset={() => {
          // Reset app state here if needed
          window.location.reload();
        }}
      >
        <Provider store={store}>
          <ThemeProvider theme={theme}>
            <AppNavigator />
          </ThemeProvider>
        </Provider>
      </ErrorBoundary>
    </React.StrictMode>
  );
};

export default App;