import type { Format, TransformableInfo } from 'logform';

// Inspect file transport formats without opening rotating log files.
jest.mock('winston-daily-rotate-file', () =>
  jest.fn().mockImplementation((options) => options),
);

describe('logging configuration', () => {
  const originalEnvironment = process.env;
  const record = {
    level: 'info',
    message: 'Request received',
    context: 'HttpLogger',
    body: { nested: { value: 1 } },
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { NODE_ENV: 'development' };
  });

  afterEach(() => {
    process.env = originalEnvironment;
  });

  function getTransports() {
    // Reload because the config reads environment variables at startup.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { winstonConfig } = require('../../config/logging.config');
    return winstonConfig.transports as Array<{
      level: string;
      format: Format;
      filename?: string;
    }>;
  }

  function render(format: Format, info: TransformableInfo = record) {
    const result = format.transform({ ...info }, {}) as TransformableInfo;
    return result[Symbol.for('message')] as string;
  }

  it.each(['development', 'production'])(
    'uses Nest text locally with NODE_ENV=%s',
    (environment) => {
      process.env.NODE_ENV = environment;
      const [consoleTransport] = getTransports();
      const output = render(consoleTransport.format);

      expect(output).toContain('[SOAPFT]');
      expect(output).toContain('[HttpLogger]');
      expect(output).toContain('Request received');
      expect(consoleTransport.level).toBe(
        environment === 'production' ? 'info' : 'debug',
      );
    },
  );

  it.each([
    { AWS_EXECUTION_ENV: 'AWS_ECS_FARGATE' },
    { AWS_EXECUTION_ENV: 'AWS_ECS_EC2' },
    { ECS_CONTAINER_METADATA_URI_V4: 'http://169.254.170.2/v4/example' },
    { ECS_CONTAINER_METADATA_URI: 'http://169.254.170.2/v3/example' },
    { LOG_FORMAT: 'json' },
  ])('emits structured single-line JSON with %j', (environment) => {
    Object.assign(process.env, environment);
    const [consoleTransport] = getTransports();
    const stack = 'Error: example\n    at test';
    const output = render(consoleTransport.format, { ...record, stack });

    expect(JSON.parse(output)).toEqual(
      expect.objectContaining({ ...record, stack }),
    );
    expect(output).not.toContain('\n');
  });

  it('allows text to be explicitly selected in ECS', () => {
    process.env.AWS_EXECUTION_ENV = 'AWS_ECS_FARGATE';
    process.env.LOG_FORMAT = 'text';
    const [consoleTransport] = getTransports();
    expect(render(consoleTransport.format)).toContain('[SOAPFT]');
  });

  it('keeps file logs structured and filters non-HTTP records', () => {
    const transports = getTransports();
    for (const transport of transports.filter((item) => item.filename)) {
      expect(JSON.parse(render(transport.format))).toEqual(
        expect.objectContaining(record),
      );
    }
    const http = transports.find((item) => item.filename?.includes('http-'));
    expect(http.format.transform({ ...record, context: 'Other' }, {})).toBe(
      false,
    );
  });
});
