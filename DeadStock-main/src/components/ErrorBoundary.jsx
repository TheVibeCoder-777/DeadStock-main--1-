import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ errorInfo });
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '40px', fontFamily: 'monospace' }}>
                    <h2 style={{ color: '#dc3545' }}>Something went wrong</h2>
                    <pre style={{
                        background: '#f8f9fa',
                        padding: '20px',
                        borderRadius: '4px',
                        whiteSpace: 'pre-wrap',
                        border: '1px solid #dee2e6',
                        maxHeight: '300px',
                        overflow: 'auto'
                    }}>
                        {this.state.error?.toString()}
                    </pre>
                    {this.state.errorInfo && (
                        <details style={{ marginTop: '10px' }}>
                            <summary>Component Stack</summary>
                            <pre style={{
                                background: '#f8f9fa',
                                padding: '20px',
                                borderRadius: '4px',
                                whiteSpace: 'pre-wrap',
                                maxHeight: '300px',
                                overflow: 'auto'
                            }}>
                                {this.state.errorInfo.componentStack}
                            </pre>
                        </details>
                    )}
                    <button
                        onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                        style={{
                            marginTop: '20px',
                            padding: '10px 20px',
                            background: '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
