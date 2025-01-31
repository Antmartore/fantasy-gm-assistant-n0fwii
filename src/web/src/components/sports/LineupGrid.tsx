import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components'; // v5.3.0
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd'; // v13.1.1

// Internal imports
import PlayerCard from './PlayerCard';
import { useLineup } from '../../hooks/useLineup';
import { theme } from '../../config/theme';
import { media } from '../../styles/responsive';
import { LineupSlot, LineupValidationStatus } from '../../types/lineup';
import { PlayerPosition } from '../../types/player';

// Styled components with responsive design and accessibility
const GridContainer = styled.div`
  display: grid;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.lg};
  background: ${theme.colors.background};
  border-radius: ${theme.spacing.sm};
  box-shadow: ${theme.shadows?.medium};
  position: relative;
  min-height: 600px;
  touch-action: none;

  ${media.mobileS(`
    grid-template-columns: 1fr;
    padding: ${theme.spacing.sm};
  `)}

  ${media.tablet(`
    grid-template-columns: repeat(2, 1fr);
    padding: ${theme.spacing.md};
  `)}

  ${media.desktop(`
    grid-template-columns: repeat(3, 1fr);
  `)}
`;

const PositionSlot = styled.div<{ isDraggingOver?: boolean; isLocked?: boolean }>`
  position: relative;
  min-height: 120px;
  border: 1px solid ${props => props.isDraggingOver ? theme.colors.accent : theme.colors.text.secondary};
  border-radius: ${theme.spacing.sm};
  background: ${props => props.isDraggingOver ? `${theme.colors.accent}10` : theme.colors.surface};
  transition: all 0.2s ease;
  opacity: ${props => props.isLocked ? 0.7 : 1};
  cursor: ${props => props.isLocked ? 'not-allowed' : 'pointer'};

  &:hover {
    border-color: ${props => !props.isLocked && theme.colors.accent};
  }

  &:focus-within {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`;

const OptimizationHint = styled.div<{ type: 'positive' | 'negative' | 'neutral' }>`
  position: absolute;
  top: -8px;
  right: -8px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: ${props => 
    props.type === 'positive' ? theme.colors.semantic.win :
    props.type === 'negative' ? theme.colors.semantic.loss :
    theme.colors.semantic.neutral
  };
  animation: pulse 2s infinite;
  z-index: 1;

  @keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.2); }
    100% { transform: scale(1); }
  }
`;

const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: ${theme.colors.background}80;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
`;

// Props interface
interface LineupGridProps {
  teamId: string;
  week: number;
  onOptimize?: () => void;
  className?: string;
}

const LineupGrid: React.FC<LineupGridProps> = ({
  teamId,
  week,
  onOptimize,
  className
}) => {
  // Custom hook for lineup management
  const {
    lineup,
    loading,
    error,
    updateLineup,
    optimizeLineup,
    swapPlayers,
    optimizationProgress,
    syncStatus
  } = useLineup({
    teamId,
    week,
    optimizationConfig: {
      strategy: 'BALANCED',
      simulationCount: 1000,
      considerWeather: true,
      considerInjuries: true,
      riskTolerance: 0.5
    }
  });

  // Local state for optimization hints
  const [optimizationHints, setOptimizationHints] = useState<Record<string, 'positive' | 'negative' | 'neutral'>>({});

  // Memoized grid layout
  const gridLayout = useMemo(() => {
    if (!lineup) return [];
    return lineup.starters.map((slot, index) => ({
      ...slot,
      index,
      hint: optimizationHints[slot.playerId]
    }));
  }, [lineup, optimizationHints]);

  // Handle drag end
  const handleDragEnd = useCallback(async (result: any) => {
    if (!result.destination || !lineup) return;

    const sourceIndex = result.source.index;
    const destinationIndex = result.destination.index;

    // Validate position compatibility
    const sourceSlot = lineup.starters[sourceIndex];
    const destSlot = lineup.starters[destinationIndex];

    if (sourceSlot.position !== destSlot.position) {
      // Check if positions are compatible (e.g., FLEX positions)
      const isCompatible = validatePositionCompatibility(sourceSlot.position, destSlot.position);
      if (!isCompatible) return;
    }

    try {
      await swapPlayers(sourceIndex, destinationIndex);
      
      // Update optimization hints after swap
      if (onOptimize) {
        onOptimize();
      }
    } catch (error) {
      console.error('Failed to swap players:', error);
    }
  }, [lineup, swapPlayers, onOptimize]);

  // Position compatibility validation
  const validatePositionCompatibility = (pos1: PlayerPosition, pos2: PlayerPosition): boolean => {
    const flexPositions = [PlayerPosition.RB, PlayerPosition.WR, PlayerPosition.TE];
    if (pos1 === pos2) return true;
    if (flexPositions.includes(pos1) && flexPositions.includes(pos2)) return true;
    return false;
  };

  // Effect for handling optimization progress
  useEffect(() => {
    if (optimizationProgress === 100) {
      // Update hints based on optimization results
      const newHints: Record<string, 'positive' | 'negative' | 'neutral'> = {};
      lineup?.starters.forEach(slot => {
        if (slot.projectedPoints > 15) {
          newHints[slot.playerId] = 'positive';
        } else if (slot.projectedPoints < 10) {
          newHints[slot.playerId] = 'negative';
        } else {
          newHints[slot.playerId] = 'neutral';
        }
      });
      setOptimizationHints(newHints);
    }
  }, [optimizationProgress, lineup]);

  if (error) {
    return (
      <GridContainer className={className} role="alert">
        Error loading lineup: {error}
      </GridContainer>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <GridContainer 
        className={className}
        role="grid"
        aria-label="Lineup Grid"
        aria-busy={loading}
      >
        {loading && (
          <LoadingOverlay>
            Loading lineup...
          </LoadingOverlay>
        )}

        <Droppable droppableId="lineup-grid">
          {(provided, snapshot) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
            >
              {gridLayout.map((slot, index) => (
                <Draggable
                  key={slot.playerId}
                  draggableId={slot.playerId}
                  index={index}
                  isDragDisabled={slot.locked}
                >
                  {(provided, snapshot) => (
                    <PositionSlot
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      isDraggingOver={snapshot.isDragging}
                      isLocked={slot.locked}
                      aria-label={`${slot.position} position slot`}
                    >
                      {slot.hint && (
                        <OptimizationHint 
                          type={slot.hint}
                          role="status"
                          aria-label={`Optimization suggestion: ${slot.hint}`}
                        />
                      )}
                      <PlayerCard
                        player={{
                          id: slot.playerId,
                          position: slot.position,
                          projectedPoints: slot.projectedPoints,
                          weatherImpact: slot.weatherImpact
                        }}
                        variant="compact"
                        showProjections
                        loading={loading}
                      />
                    </PositionSlot>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </GridContainer>
    </DragDropContext>
  );
};

export default LineupGrid;