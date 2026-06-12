import type {
  CreateScaleAiGateReviewRequestDto,
  CreateScaleCostSnapshotRequestDto,
  CreateScaleEvalRunRequestDto,
  CreateScaleLearningEventRequestDto,
  CreateScaleMigrationDrillRequestDto,
  CreateScalePerformanceRunRequestDto,
  ScaleAiGateReviewDto,
  ScaleAiGateReviewListResponseDto,
  ScaleCostSnapshotDto,
  ScaleCostSnapshotListResponseDto,
  ScaleEvalRunDto,
  ScaleEvalRunListResponseDto,
  ScaleLearningEventDto,
  ScaleLearningEventListResponseDto,
  ScaleMigrationDrillDto,
  ScaleMigrationDrillListResponseDto,
  ScalePerformanceRunDto,
  ScalePerformanceRunListResponseDto,
  ScaleReadinessSummaryDto,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';

export function createScalePerformanceRun(
  input: CreateScalePerformanceRunRequestDto,
): Promise<ScalePerformanceRunDto> {
  return apiFetch<ScalePerformanceRunDto>('/scale/performance-runs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listScalePerformanceRuns(): Promise<ScalePerformanceRunListResponseDto> {
  return apiFetch<ScalePerformanceRunListResponseDto>('/scale/performance-runs');
}

export function createScaleCostSnapshot(
  input: CreateScaleCostSnapshotRequestDto,
): Promise<ScaleCostSnapshotDto> {
  return apiFetch<ScaleCostSnapshotDto>('/scale/cost-snapshots', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listScaleCostSnapshots(): Promise<ScaleCostSnapshotListResponseDto> {
  return apiFetch<ScaleCostSnapshotListResponseDto>('/scale/cost-snapshots');
}

export function createScaleEvalRun(input: CreateScaleEvalRunRequestDto): Promise<ScaleEvalRunDto> {
  return apiFetch<ScaleEvalRunDto>('/scale/eval-runs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listScaleEvalRuns(): Promise<ScaleEvalRunListResponseDto> {
  return apiFetch<ScaleEvalRunListResponseDto>('/scale/eval-runs');
}

export function createScaleMigrationDrill(
  input: CreateScaleMigrationDrillRequestDto,
): Promise<ScaleMigrationDrillDto> {
  return apiFetch<ScaleMigrationDrillDto>('/scale/migration-drills', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listScaleMigrationDrills(): Promise<ScaleMigrationDrillListResponseDto> {
  return apiFetch<ScaleMigrationDrillListResponseDto>('/scale/migration-drills');
}

export function createScaleLearningEvent(
  input: CreateScaleLearningEventRequestDto,
): Promise<ScaleLearningEventDto> {
  return apiFetch<ScaleLearningEventDto>('/scale/learning-events', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listScaleLearningEvents(): Promise<ScaleLearningEventListResponseDto> {
  return apiFetch<ScaleLearningEventListResponseDto>('/scale/learning-events');
}

export function createScaleAiGateReview(
  input: CreateScaleAiGateReviewRequestDto,
): Promise<ScaleAiGateReviewDto> {
  return apiFetch<ScaleAiGateReviewDto>('/scale/ai-gate-reviews', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listScaleAiGateReviews(): Promise<ScaleAiGateReviewListResponseDto> {
  return apiFetch<ScaleAiGateReviewListResponseDto>('/scale/ai-gate-reviews');
}

export function getScaleReadiness(): Promise<ScaleReadinessSummaryDto> {
  return apiFetch<ScaleReadinessSummaryDto>('/scale/readiness');
}
