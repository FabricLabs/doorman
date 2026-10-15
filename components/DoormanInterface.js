'use strict';

const React = require('react');
const {
  Container,
  Header,
  Segment,
  Table,
  Label,
  Statistic,
  Message,
  Icon,
  Grid
} = require('semantic-ui-react');

const Bridge = require('@fabric/hub/components/Bridge');

const EVENT_KINDS = ['message', 'response', 'user', 'channel', 'join', 'part', 'presence', 'trigger'];
const REFRESH_MS = 30000;

function parseGenericContent (content) {
  try {
    const text = typeof content === 'string' ? content : (content && typeof content.toString === 'function' ? content.toString() : '');
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function formatValue (value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

/**
 * Render a plugin `report()` payload: scalars as a key/value table, arrays of
 * objects as a table, anything else as formatted JSON.
 */
function ReportView ({ report }) {
  if (report === null || report === undefined) return <p className="doorman-mono">No report.</p>;
  if (Array.isArray(report)) return <ArrayView rows={report} />;
  if (typeof report !== 'object') return <p className="doorman-mono">{formatValue(report)}</p>;

  const keys = Object.keys(report);
  if (!keys.length) return <p className="doorman-mono">Empty report.</p>;
  return (
    <Table basic="very" compact size="small" className="doorman-report">
      <Table.Body>
        {keys.map((key) => {
          const value = report[key];
          const nested = value && typeof value === 'object';
          return (
            <Table.Row key={key}>
              <Table.Cell collapsing><strong>{key}</strong></Table.Cell>
              <Table.Cell>
                {nested
                  ? (Array.isArray(value) ? <ArrayView rows={value} /> : <pre className="doorman-mono">{formatValue(value)}</pre>)
                  : <span className="doorman-mono">{formatValue(value)}</span>}
              </Table.Cell>
            </Table.Row>
          );
        })}
      </Table.Body>
    </Table>
  );
}

function ArrayView ({ rows }) {
  if (!rows.length) return <span className="doorman-mono">[]</span>;
  const objects = rows.every((row) => row && typeof row === 'object' && !Array.isArray(row));
  if (!objects) return <pre className="doorman-mono">{formatValue(rows)}</pre>;
  const columns = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set()));
  return (
    <Table celled compact size="small">
      <Table.Header>
        <Table.Row>
          {columns.map((column) => <Table.HeaderCell key={column}>{column}</Table.HeaderCell>)}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {rows.map((row, index) => (
          <Table.Row key={index}>
            {columns.map((column) => <Table.Cell key={column} className="doorman-mono">{formatValue(row[column])}</Table.Cell>)}
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}

/**
 * Read-only Doorman console. Pulls `GetDoormanStatus` / `GetDoormanReport`
 * through the Hub Bridge's JSON-RPC client and bumps counters live from
 * `DoormanEvent` GenericMessage frames on the Bridge WebSocket.
 */
class DoormanInterface extends React.Component {
  constructor (props) {
    super(props);

    this.bridgeRef = React.createRef();
    this.state = {
      connected: false,
      status: null,
      report: null,
      error: null,
      lastEvent: null,
      loadedAt: null
    };

    this.handleBridgeState = this.handleBridgeState.bind(this);
    this.handleCapture = this.handleCapture.bind(this);
    this.refresh = this.refresh.bind(this);
  }

  componentDidMount () {
    this._mounted = true;
    this.refresh();
    this._timer = setInterval(this.refresh, REFRESH_MS);
  }

  componentWillUnmount () {
    this._mounted = false;
    if (this._timer) clearInterval(this._timer);
  }

  handleBridgeState (bridgeState) {
    if (!this._mounted || !bridgeState) return;
    const connected = bridgeState.isConnected === true;
    if (connected !== this.state.connected) {
      this.setState({ connected });
      if (connected) this.refresh();
    }
  }

  handleCapture (captured) {
    if (!this._mounted || !captured || captured.type !== 'GenericMessage') return;
    const parsed = parseGenericContent(captured.content);
    if (!parsed || parsed.type !== 'DoormanEvent' || !parsed.object) return;
    this.applyEvent(parsed.object);
  }

  applyEvent (event) {
    this.setState((previous) => {
      const status = previous.status ? Object.assign({}, previous.status) : null;
      if (status) {
        status.counts = Object.assign({}, status.counts);
        if (event.kind && typeof event.total === 'number') status.counts[event.kind] = event.total;
        if (event.service) {
          status.services = (status.services || []).map((service) => {
            if (service.name !== event.service) return service;
            const next = Object.assign({}, service, { counts: Object.assign({}, service.counts) });
            if (event.kind === 'service') {
              next.ready = event.ready === true;
              if (next.ready && !next.readyAt) next.readyAt = new Date().toISOString();
            } else if (event.kind && typeof event.count === 'number') {
              next.counts[event.kind] = event.count;
            }
            return next;
          });
        }
      }
      return { status, lastEvent: Object.assign({ at: new Date().toISOString() }, event) };
    });
  }

  async rpc (method) {
    const bridge = this.bridgeRef.current;
    if (bridge && typeof bridge.callHubJsonRpc === 'function') {
      return bridge.callHubJsonRpc(method, {});
    }
    // Bridge not mounted yet: same endpoint, same envelope.
    try {
      const response = await fetch('/services/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params: [{}] })
      });
      const body = await response.json();
      if (body && body.error) return { error: body.error.message || String(body.error) };
      return { result: body ? body.result : null };
    } catch (error) {
      return { error: error && error.message ? error.message : String(error) };
    }
  }

  async refresh () {
    const [status, report] = await Promise.all([this.rpc('GetDoormanStatus'), this.rpc('GetDoormanReport')]);
    if (!this._mounted) return;
    if (status.error) return this.setState({ error: status.error });
    this.setState({
      status: status.result,
      report: report.error ? null : report.result,
      error: report.error || null,
      loadedAt: new Date().toISOString()
    });
  }

  renderServices () {
    const services = (this.state.status && this.state.status.services) || [];
    return (
      <Segment>
        <Header as="h3"><Icon name="plug" />Services</Header>
        {!services.length && <p>No platform adapters enabled.</p>}
        {services.length > 0 && (
          <Table compact size="small">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Name</Table.HeaderCell>
                <Table.HeaderCell>Type</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Messages</Table.HeaderCell>
                <Table.HeaderCell>Presence</Table.HeaderCell>
                <Table.HeaderCell>Users</Table.HeaderCell>
                <Table.HeaderCell>Channels</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {services.map((service) => (
                <Table.Row key={service.name}>
                  <Table.Cell><strong>{service.name}</strong></Table.Cell>
                  <Table.Cell className="doorman-mono">{service.type}</Table.Cell>
                  <Table.Cell>
                    {service.ready
                      ? <Label color="green" size="small" title={service.readyAt || ''}>ready</Label>
                      : <Label size="small">connecting</Label>}
                  </Table.Cell>
                  <Table.Cell>{service.counts.message || 0}</Table.Cell>
                  <Table.Cell>{service.counts.presence || 0}</Table.Cell>
                  <Table.Cell>{service.counts.user || 0}</Table.Cell>
                  <Table.Cell>{service.counts.channel || 0}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Segment>
    );
  }

  renderPlugins () {
    const status = this.state.status || {};
    const plugins = status.plugins || [];
    const reports = (this.state.report && this.state.report.plugins) || {};
    const trigger = status.trigger || '!';
    const unowned = (status.triggers || []).filter((name) => {
      return !plugins.some((plugin) => plugin.triggers.includes(name));
    });
    return (
      <Segment>
        <Header as="h3"><Icon name="puzzle piece" />Plugins</Header>
        {!plugins.length && <p>No plugins loaded.</p>}
        {plugins.map((plugin) => (
          <Segment key={plugin.name} secondary>
            <Header as="h4">
              {plugin.name}
              {plugin.triggers.map((name) => <Label key={name} basic size="small" className="doorman-mono">{trigger}{name}</Label>)}
            </Header>
            {plugin.hasReport
              ? <ReportView report={reports[plugin.name]} />
              : <p className="doorman-mono">No report() on this plugin.</p>}
          </Segment>
        ))}
        {unowned.length > 0 && (
          <div>
            <Header as="h4">Triggers</Header>
            {unowned.map((name) => <Label key={name} basic size="small" className="doorman-mono">{trigger}{name}</Label>)}
          </div>
        )}
      </Segment>
    );
  }

  renderCounters () {
    const counts = (this.state.status && this.state.status.counts) || {};
    return (
      <Segment>
        <Header as="h3"><Icon name="chart bar" />Events</Header>
        <Statistic.Group size="mini" widths={EVENT_KINDS.length}>
          {EVENT_KINDS.map((kind) => (
            <Statistic key={kind}>
              <Statistic.Value>{counts[kind] || 0}</Statistic.Value>
              <Statistic.Label>{kind}</Statistic.Label>
            </Statistic>
          ))}
        </Statistic.Group>
        {this.state.lastEvent && (
          <p className="doorman-mono" style={{ marginTop: '1em' }}>
            last: {this.state.lastEvent.kind}
            {this.state.lastEvent.service ? ` from ${this.state.lastEvent.service}` : ''}
            {` at ${this.state.lastEvent.at}`}
          </p>
        )}
      </Segment>
    );
  }

  render () {
    const status = this.state.status;
    return (
      <Container>
        <Bridge
          ref={this.bridgeRef}
          onStateUpdate={this.handleBridgeState}
          responseCapture={this.handleCapture}
        />
        <Grid verticalAlign="middle">
          <Grid.Column width={10}>
            <Header as="h1">
              <code>{(status && status.name) || '@fabric/doorman'}</code>
              <Header.Subheader>
                Read-only console{status && status.startedAt ? ` · up since ${status.startedAt}` : ''}
              </Header.Subheader>
            </Header>
          </Grid.Column>
          <Grid.Column width={6} textAlign="right">
            <Label color={this.state.connected ? 'green' : 'grey'}>
              <Icon name="circle" />{this.state.connected ? 'live' : 'polling'}
            </Label>
            {this.state.loadedAt && <Label basic title={this.state.loadedAt}>refreshed</Label>}
          </Grid.Column>
        </Grid>
        {this.state.error && <Message negative><Message.Header>Console unavailable</Message.Header><p>{this.state.error}</p></Message>}
        {!status && !this.state.error && <Segment loading padded="very" />}
        {status && this.renderCounters()}
        {status && this.renderServices()}
        {status && this.renderPlugins()}
      </Container>
    );
  }
}

module.exports = DoormanInterface;
