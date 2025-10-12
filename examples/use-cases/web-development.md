# Web Development Use Case

This use case demonstrates how to configure Copilot Multi-Agent for a typical web development team working on modern web applications.

## Team Structure

A typical web development team needs expertise in:
- Frontend development (React, Vue, Angular)
- Backend development (Node.js, Python, Java)
- Database design and optimization
- DevOps and deployment
- Testing and quality assurance
- Security and performance

## Recommended Configuration

### Coordinator Setup
The coordinator should understand the full web development stack and be able to route tasks appropriately:

```json
{
  "systemPrompt": "You are a web development coordinator with expertise across the full stack. You manage specialists in frontend, backend, database, DevOps, testing, and security. Analyze requests and delegate to the most appropriate specialist or handle simple tasks directly. For complex features, coordinate between multiple specialists.",
  "description": "Full-stack web development coordinator",
  "useFor": "Web application development, full-stack coordination, feature planning"
}
```

### Specialized Agents

#### Frontend Specialist
```json
{
  "name": "frontend-dev",
  "systemPrompt": "You are a senior frontend developer specializing in React, TypeScript, and modern CSS. Focus on component architecture, state management, responsive design, and user experience. Create maintainable, accessible, and performant user interfaces.",
  "useFor": "React components, TypeScript, CSS, responsive design, user interfaces"
}
```

#### Backend Specialist
```json
{
  "name": "backend-dev", 
  "systemPrompt": "You are a senior backend developer with expertise in Node.js, Express, REST APIs, and database integration. Focus on scalable server architecture, API design, authentication, and data management.",
  "useFor": "Node.js APIs, Express servers, authentication, database integration"
}
```

#### Database Specialist
```json
{
  "name": "database-expert",
  "systemPrompt": "You are a database specialist with expertise in PostgreSQL, MongoDB, and database optimization. Design efficient schemas, write optimized queries, and handle data migrations.",
  "useFor": "Database design, query optimization, data modeling, migrations"
}
```

## Common Workflows

### Feature Development
1. **Planning**: Coordinator analyzes feature requirements
2. **Database Design**: Database expert designs schema changes
3. **Backend Implementation**: Backend dev creates APIs
4. **Frontend Implementation**: Frontend dev builds UI components
5. **Integration**: Coordinator oversees integration and testing

### Code Review Process
1. **Initial Review**: Code reviewer checks overall quality
2. **Security Review**: Security specialist reviews for vulnerabilities
3. **Performance Review**: Performance specialist optimizes bottlenecks
4. **Final Integration**: Coordinator ensures all pieces work together

### Deployment Pipeline
1. **Testing**: Test engineer creates comprehensive test suite
2. **Infrastructure**: DevOps specialist sets up deployment pipeline
3. **Security**: Security specialist reviews deployment security
4. **Monitoring**: DevOps specialist implements monitoring and alerts

## Example Interactions

### Complex Feature Request
```
@multi-agent I need to build a user authentication system with social login, email verification, and role-based access control
```

**Expected Flow**:
1. Coordinator analyzes requirements
2. Delegates database schema design to database expert
3. Delegates API implementation to backend developer
4. Delegates UI components to frontend developer
5. Delegates security review to security specialist
6. Coordinates integration and testing

### Performance Optimization
```
@multi-agent The application is loading slowly. Please analyze and optimize performance across the stack
```

**Expected Flow**:
1. Coordinator identifies performance bottlenecks
2. Delegates frontend optimization to frontend specialist
3. Delegates database query optimization to database expert
4. Delegates server optimization to backend developer
5. Coordinates implementation of improvements

## Best Practices

### Agent Specialization
- Keep agents focused on their expertise areas
- Avoid overlapping responsibilities
- Use delegation to coordinate between specialists

### Communication Flow
- Route complex requests through the coordinator
- Allow specialists to collaborate through delegation
- Maintain clear reporting back to the coordinator

### Tool Permissions
- Give coordinators broad tool access
- Limit specialist tool access to their domain
- Ensure delegation tools are available where needed

### System Prompts
- Be specific about each agent's expertise
- Include examples of tasks they should handle
- Specify how they should collaborate with other agents

## Configuration Tips

1. **Start Simple**: Begin with 3-4 core agents and expand as needed
2. **Clear Boundaries**: Define clear responsibilities for each agent
3. **Test Delegation**: Verify that agents can effectively delegate to each other
4. **Iterate**: Refine system prompts based on actual usage patterns
5. **Monitor Performance**: Watch for bottlenecks in delegation chains