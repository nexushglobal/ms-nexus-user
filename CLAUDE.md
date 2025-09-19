# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Individual Service Development
```bash
# Install dependencies
pnpm install

# Development with hot reload
pnpm run start:dev

# Debug mode with --debug --watch
pnpm run start:debug

# Production build
pnpm run build

# Start production
pnpm run start:prod

# Linting with auto-fix
pnpm run lint

# Prettier formatting
pnpm run format
```

### Testing Commands
```bash
# Unit tests
pnpm run test

# Unit tests in watch mode
pnpm run test:watch

# Unit tests with coverage
pnpm run test:cov

# Debug mode for tests
pnpm run test:debug

# End-to-end tests
pnpm run test:e2e

# Run specific test
pnpm run test -- --testNamePattern="specific test"
```

### Docker Development (from parent directory)
```bash
# From parent directory (ms-nexus-dev)
.\dev-docker.ps1 up                    # Start all services
.\dev-docker.ps1 logs ms-users         # View user service logs
.\dev-docker.ps1 restart ms-users      # Restart user service
.\dev-docker.ps1 shell ms-users        # Access user service shell
```

## Architecture Overview

**ms-nexus-user** is the Users microservice in the Nexus Global Network MLM platform. It handles user management, authentication data, team structures, and role-based permissions using MongoDB as its primary database.

### Core Responsibilities

- **User Management**: User profiles, registration, and account information
- **Role System**: Role-based permissions and access control
- **Tree Management**: MLM tree structures (binary and unilevel relationships)
- **Password Management**: Password resets and security
- **User Information**: Dashboard data and team statistics
- **Views/Permissions**: UI permissions and access levels

### Service Architecture

**Microservice Pattern**: NATS-based communication with other services
- **Database**: MongoDB with Mongoose ODM
- **Communication**: NATS message broker for inter-service calls
- **Authentication**: JWT validation (delegated to Auth service)
- **Validation**: class-validator with custom DTOs

### Key Modules

#### UsersModule (`src/users/`)
- **Controllers**: 5 specialized controllers for different user operations
  - `UsersController`: Core user CRUD operations
  - `ProfileController`: User profile management
  - `TreeController`: MLM tree operations and queries
  - `PasswordResetController`: Password reset functionality
  - `UserInfoController`: Dashboard and user statistics
- **Services**: Corresponding services for business logic
- **Schemas**: MongoDB schemas for users and password reset tokens

#### RolesModule (`src/roles/`)
- **Role Management**: System roles and permissions
- **Role Assignment**: User role assignments and validations

#### ViewsModule (`src/views/`)
- **UI Permissions**: Frontend view access control
- **Permission Sets**: Granular UI permission management

### Database Schema Structure

**MongoDB Collections**:
- **users**: Core user data, tree relationships, roles
- **roles**: System roles and permission definitions
- **views**: UI permission and access configurations
- **passwordresettokens**: Temporary password reset tokens

### Inter-Service Communication

**NATS Client Patterns**: The service communicates with other microservices via NATS:
- **Membership Service**: User membership status and plan information
- **Point Service**: User points, volumes, and commission data
- **Unilevel Service**: MLM tree calculations and team statistics
- **Payment Service**: Financial data related to users

**Service Clients Configuration**: All external service clients are configured in `UsersModule` with NATS transport and timeout handling.

### Key Service Communication Examples

```typescript
// Membership service call pattern
this.membershipClient.send<MembershipInfo>(
  { cmd: 'membership.getUserMembershipByUserId' },
  { userId }
).pipe(timeout(10000), catchError(...))

// Point service integration for user dashboard
this.pointClient.send<PointInfo>(
  { cmd: 'point.getUserPoints' },
  { userId }
)
```

### Environment Configuration

**Required Environment Variables**:
- `MONGODB_URI`: MongoDB connection string
- `NATS_SERVERS`: NATS broker connection (default: nats://localhost:4222)
- `NODE_ENV`: Environment mode (development/production/test)
- `PORT`: Service port (default: 3000)

### Development Patterns

**Controller Organization**: Controllers are organized by feature area rather than resource type, allowing for better separation of concerns in complex user operations.

**Service Layer**: Each controller has a corresponding service that handles business logic and external service communication.

**Schema Validation**: Uses Mongoose schemas with built-in validation combined with class-validator DTOs for request validation.

**Error Handling**: Standardized error responses with service identification for debugging across microservices.

### Common Development Tasks

**Adding New User Endpoints**:
1. Create/update DTOs in appropriate controller directory
2. Add endpoint to relevant controller with proper guards
3. Implement business logic in corresponding service
4. Add MongoDB queries using Mongoose models
5. Test with `pnpm run test` and `pnpm run lint`

**Inter-Service Communication**:
1. Register new service client in `UsersModule`
2. Add service constant to `src/config/services.ts`
3. Inject client in service constructor
4. Use `.send()` pattern with timeout and error handling

**Database Schema Changes**:
1. Update Mongoose schema in `src/*/schemas/`
2. Ensure schema is registered in module imports
3. Test with existing data migration if needed

**Role and Permission Updates**:
1. Modify role schemas and validation
2. Update role service logic
3. Test role assignment and permission checks