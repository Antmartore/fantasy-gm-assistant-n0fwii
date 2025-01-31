/**
 * @fileoverview Redux reducer for managing simulation state with performance optimization
 * Handles Monte Carlo simulations, season projections, and lineup optimizations
 * @version 1.0.0
 */

import { createReducer } from '@reduxjs/toolkit'; // v1.9.5
import { 
    SimulationType,
    Simulation,
    SimulationStatus
} from '../../types/simulation';

/**
 * Interface for enhanced simulation state with performance tracking
 */
interface SimulationsState {
    results: Simulation[];
    loading: boolean;
    progress: number;
    error: string | null;
    selectedSimulation: Simulation | null;
    totalSimulations: number;
    completedSimulations: number;
    performanceMetrics: Record<string, number>;
}

/**
 * Initial state with performance monitoring setup
 */
const INITIAL_STATE: SimulationsState = {
    results: [],
    loading: false,
    progress: 0,
    error: null,
    selectedSimulation: null,
    totalSimulations: 0,
    completedSimulations: 0,
    performanceMetrics: {
        averageExecutionTime: 0,
        successRate: 100,
        lastResponseTime: 0
    }
};

// Performance threshold for monitoring (2 seconds as per requirements)
const PERFORMANCE_THRESHOLD_MS = 2000;

// Maximum results to store in state for performance
const MAX_RESULTS_PER_PAGE = 50;

/**
 * Enhanced reducer with performance optimization and monitoring
 */
const simulationReducer = createReducer(INITIAL_STATE, (builder) => {
    builder
        // Initialize new simulation
        .addCase('simulation/initialize', (state, action) => {
            const startTime = Date.now();
            state.loading = true;
            state.error = null;
            state.progress = 0;
            state.totalSimulations++;
            
            // Track execution time
            state.performanceMetrics.lastResponseTime = startTime;
        })

        // Update simulation progress
        .addCase('simulation/updateProgress', (state, action) => {
            state.progress = action.payload;
            
            // Performance monitoring
            const currentTime = Date.now();
            const executionTime = currentTime - state.performanceMetrics.lastResponseTime;
            
            if (executionTime > PERFORMANCE_THRESHOLD_MS) {
                console.warn(`Simulation progress update exceeded performance threshold: ${executionTime}ms`);
            }
        })

        // Handle successful completion
        .addCase('simulation/complete', (state, action) => {
            const { simulation } = action.payload;
            const endTime = Date.now();
            const executionTime = endTime - state.performanceMetrics.lastResponseTime;

            state.loading = false;
            state.progress = 100;
            state.completedSimulations++;
            
            // Update performance metrics
            state.performanceMetrics.averageExecutionTime = 
                (state.performanceMetrics.averageExecutionTime * (state.completedSimulations - 1) + executionTime) 
                / state.completedSimulations;
            
            // Maintain performance by limiting stored results
            state.results = [
                simulation,
                ...state.results.slice(0, MAX_RESULTS_PER_PAGE - 1)
            ];

            // Update selected simulation if relevant
            if (state.selectedSimulation?.id === simulation.id) {
                state.selectedSimulation = simulation;
            }
        })

        // Handle simulation failure
        .addCase('simulation/error', (state, action) => {
            state.loading = false;
            state.error = action.payload;
            
            // Update performance metrics
            state.performanceMetrics.successRate = 
                ((state.completedSimulations - 1) / state.totalSimulations) * 100;
        })

        // Select specific simulation
        .addCase('simulation/select', (state, action) => {
            state.selectedSimulation = state.results.find(
                sim => sim.id === action.payload
            ) || null;
        })

        // Cancel ongoing simulation
        .addCase('simulation/cancel', (state, action) => {
            state.loading = false;
            state.progress = 0;
            
            if (state.selectedSimulation?.status === SimulationStatus.RUNNING) {
                state.selectedSimulation.status = SimulationStatus.CANCELLED;
            }
        })

        // Clear simulation results
        .addCase('simulation/clear', (state) => {
            state.results = [];
            state.selectedSimulation = null;
            state.completedSimulations = 0;
            state.totalSimulations = 0;
            state.performanceMetrics = {
                averageExecutionTime: 0,
                successRate: 100,
                lastResponseTime: 0
            };
        })

        // Filter simulations by type
        .addCase('simulation/filter', (state, action) => {
            const { type } = action.payload;
            state.results = state.results.filter(sim => sim.type === type);
        })

        // Update simulation status
        .addCase('simulation/updateStatus', (state, action) => {
            const { id, status } = action.payload;
            const simulation = state.results.find(sim => sim.id === id);
            
            if (simulation) {
                simulation.status = status;
                
                if (state.selectedSimulation?.id === id) {
                    state.selectedSimulation.status = status;
                }
            }
        });
});

export default simulationReducer;