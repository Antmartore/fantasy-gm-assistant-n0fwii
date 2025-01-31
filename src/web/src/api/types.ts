// External imports
// axios: ^1.4.0 - Type definition for Axios error responses and network error handling
import { AxiosError } from 'axios';

// Global constants
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_SORT_ORDER = SortOrder.DESC;
export const API_VERSION = 'v1';

// HTTP Methods
export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS';

// Enhanced API Headers
export interface ApiHeaders {
  Authorization: string;
  'x-api-key': string;
  'x-client-version': string;
  'x-request-id': string;
  'x-correlation-id': string;
}

// Response Metadata
export interface ResponseMetadata {
  requestId: string;
  processingTime: number;
  apiVersion: string;
}

// Generic API Response
export interface ApiResponse<T> {
  data: T;
  status: number;
  message: string;
  timestamp: number;
  metadata: ResponseMetadata;
}

// Enhanced Error Response
export interface ApiError {
  code: ErrorCode;
  message: string;
  details: Record<string, any>;
  timestamp: number;
  path: string;
  requestId: string;
}

// Error Code Enumeration
export enum ErrorCode {
  AUTH_ERROR = 1000,
  PERMISSION_ERROR = 2000,
  VALIDATION_ERROR = 3000,
  RATE_LIMIT_ERROR = 4000,
  SERVER_ERROR = 5000,
  INTEGRATION_ERROR = 6000
}

// Paginated Response
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  totalPages: number;
}

// Sort Order
export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc'
}

// Filter Operators
export type FilterOperator = 
  | 'eq' 
  | 'ne' 
  | 'gt' 
  | 'lt' 
  | 'gte' 
  | 'lte' 
  | 'in' 
  | 'nin' 
  | 'contains' 
  | 'startsWith' 
  | 'endsWith';

// Filter Parameters
export interface FilterParams {
  field: string;
  operator: FilterOperator;
  value: any;
}

// Request Parameters
export interface RequestParams {
  page: number;
  limit: number;
  sort: string;
  order: SortOrder;
  filter: FilterParams;
  search: string;
}

// Type guard for API errors
export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'timestamp' in error
  );
}

// Type guard for Axios errors
export function isAxiosError<T>(error: unknown): error is AxiosError<T> {
  return (error as AxiosError).isAxiosError === true;
}

// Helper type for successful responses
export type ApiSuccess<T> = ApiResponse<T>;

// Helper type for error responses
export type ApiFailure = ApiResponse<ApiError>;

// Helper type for paginated request parameters
export type PaginatedRequestParams = Omit<RequestParams, 'filter' | 'search'>;

// Helper type for filtering request parameters
export type FilterRequestParams = Pick<RequestParams, 'filter' | 'search'>;

// Helper type for combining pagination and filtering
export type FullRequestParams = PaginatedRequestParams & FilterRequestParams;