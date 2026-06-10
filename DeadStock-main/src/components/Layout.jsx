import React, { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faChartLine,
    faTruck,
    faFileInvoice,
    faDesktop,
    faCompactDisc,
    faRecycle,
    faUsers,
    faChevronDown,
    faChevronUp,
    faBars,
    faHistory,
    faChartBar,
    faArchive,
    faEdit,
    faShieldAlt,
    faFileContract
} from '@fortawesome/free-solid-svg-icons';

const Layout = () => {
    const [expandedMenu, setExpandedMenu] = useState(null);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [hardwareCategories, setHardwareCategories] = useState([]);

    // Office name state
    const [officeName, setOfficeName] = useState('');
    const [isEditingOffice, setIsEditingOffice] = useState(false);
    const [officeInputValue, setOfficeInputValue] = useState('');

    // User profile state
    const [userProfile, setUserProfile] = useState(null);
    const [showProfileDropdown, setShowProfileDropdown] = useState(false);
    const [showSetupModal, setShowSetupModal] = useState(false);
    const [setupForm, setSetupForm] = useState({ name: '', employeeId: '', phone: '' });

    // Load data from localStorage on mount
    useEffect(() => {
        const storedOfficeName = localStorage.getItem('officeName');
        const storedUserProfile = localStorage.getItem('userProfile');

        if (storedOfficeName) {
            setOfficeName(storedOfficeName);
        } else {
            setOfficeName('EDP Audit - I, Jaipur');
            localStorage.setItem('officeName', 'EDP Audit - I, Jaipur');
        }

        if (storedUserProfile) {
            setUserProfile(JSON.parse(storedUserProfile));
        } else {
            setShowSetupModal(true);
        }
    }, []);

    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const res = await fetch('http://localhost:3001/api/hardware/config');
                if (res.ok) {
                    const data = await res.json();
                    setHardwareCategories(data);
                }
            } catch (error) {
                console.error('Failed to fetch categories:', error);
            }
        };
        fetchCategories();

        // Listen for hardware config updates to refresh sidebar
        const handleConfigUpdate = () => {
            fetchCategories();
        };
        window.addEventListener('hardwareConfigUpdated', handleConfigUpdate);

        return () => {
            window.removeEventListener('hardwareConfigUpdated', handleConfigUpdate);
        };
    }, []);

    const toggleMenu = (name) => {
        setExpandedMenu(expandedMenu === name ? null : name);
    };

    const toggleSidebar = () => {
        setIsSidebarCollapsed(!isSidebarCollapsed);
    };

    const handleOfficeDoubleClick = () => {
        setIsEditingOffice(true);
        setOfficeInputValue(officeName);
    };

    const handleOfficeSave = () => {
        if (officeInputValue.trim()) {
            setOfficeName(officeInputValue.trim());
            localStorage.setItem('officeName', officeInputValue.trim());
        }
        setIsEditingOffice(false);
    };

    const handleOfficeKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleOfficeSave();
        } else if (e.key === 'Escape') {
            setIsEditingOffice(false);
        }
    };

    const handleSetupSubmit = (e) => {
        e.preventDefault();
        if (setupForm.name.trim() && setupForm.employeeId.trim()) {
            const profile = {
                name: setupForm.name.trim(),
                employeeId: setupForm.employeeId.trim(),
                phone: setupForm.phone.trim()
            };
            setUserProfile(profile);
            localStorage.setItem('userProfile', JSON.stringify(profile));
            setShowSetupModal(false);
            setSetupForm({ name: '', employeeId: '', phone: '' });
        }
    };

    const handleEditProfile = () => {
        setSetupForm({
            name: userProfile.name,
            employeeId: userProfile.employeeId,
            phone: userProfile.phone
        });
        setShowProfileDropdown(false);
        setShowSetupModal(true);
    };

    const navItems = [
        { name: 'Dashboard', path: '/', icon: faChartLine },
        { name: 'Suppliers', path: '/suppliers', icon: faTruck },
        { name: 'Invoices', path: '/invoices', icon: faFileInvoice },
        {
            name: 'Hardware',
            icon: faDesktop,
            children: [
                ...hardwareCategories.map(c => ({
                    name: c.category,
                    path: `/hardware/${c.category}`
                })),
                { name: 'Add Item', path: '/hardware/config' }
            ]
        },
        { name: 'Hardware Allocation', path: '/allocation', icon: faHistory },
        { name: 'Software', path: '/software', icon: faCompactDisc },
        {
            name: 'E-Waste',
            icon: faRecycle,
            children: [
                { name: 'Dashboard', path: '/e-waste' }
            ]
        },
        {
            name: 'Employees',
            icon: faUsers,
            children: [
                { name: 'Employee Directory', path: '/employees' },
                { name: 'Manage Options', path: '/employees/config' }
            ]
        },
        { name: 'Reports', path: '/reports', icon: faChartBar },
        { name: 'AMC Management', path: '/amc', icon: faFileContract },
        { name: 'Perm. Allocation', path: '/permanent-allocation', icon: faArchive },
        { name: 'Backup', path: '/backup', icon: faShieldAlt },
    ];

    return (
        <div className={`app-container ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
            {/* Sidebar */}
            <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
                <div className="sidebar-header">
                    {!isSidebarCollapsed && <h2>Dead Stock</h2>}
                    {isSidebarCollapsed && <h2 title="Dead Stock">DS</h2>}
                </div>
                <nav className="sidebar-nav">
                    {navItems.map((item) => (
                        <React.Fragment key={item.name}>
                            {item.children ? (
                                <div className="nav-group">
                                    <div
                                        className="nav-link parent"
                                        onClick={() => toggleMenu(item.name)}
                                        style={{ cursor: 'pointer', justifyContent: isSidebarCollapsed ? 'center' : 'space-between' }}
                                        title={isSidebarCollapsed ? item.name : ''}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <FontAwesomeIcon icon={item.icon} />
                                            {!isSidebarCollapsed && <span>{item.name}</span>}
                                        </div>
                                        {!isSidebarCollapsed && <FontAwesomeIcon icon={expandedMenu === item.name ? faChevronUp : faChevronDown} style={{ fontSize: '0.8em' }} />}
                                    </div>
                                    {expandedMenu === item.name && !isSidebarCollapsed && (
                                        <div className="nav-children" style={{ paddingLeft: '20px' }}>
                                            {item.children.map(child => (
                                                <NavLink
                                                    key={child.name}
                                                    to={child.path}
                                                    className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                                                    style={{ fontSize: '0.9em', padding: '8px 15px' }}
                                                >
                                                    <span>{child.name}</span>
                                                </NavLink>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <NavLink
                                    to={item.path}
                                    className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                                    style={{ justifyContent: isSidebarCollapsed ? 'center' : 'flex-start' }}
                                    title={isSidebarCollapsed ? item.name : ''}
                                >
                                    <FontAwesomeIcon icon={item.icon} />
                                    {!isSidebarCollapsed && <span>{item.name}</span>}
                                </NavLink>
                            )}
                        </React.Fragment>
                    ))}
                </nav>
            </aside>

            {/* Main Content Area */}
            <div className="main-content">
                {/* Topbar */}
                <header className="topbar">
                    <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '20px' }}>
                        <button className="btn-icon sidebar-toggle" onClick={toggleSidebar}>
                            <FontAwesomeIcon icon={faBars} />
                        </button>

                        {/* Office Name Section */}
                        <div className="office-info">
                            {isEditingOffice ? (
                                <input
                                    type="text"
                                    className="office-title editing"
                                    value={officeInputValue}
                                    onChange={(e) => setOfficeInputValue(e.target.value)}
                                    onBlur={handleOfficeSave}
                                    onKeyDown={handleOfficeKeyPress}
                                    autoFocus
                                />
                            ) : (
                                <div
                                    className="office-title"
                                    onDoubleClick={handleOfficeDoubleClick}
                                    title="Double-click to edit"
                                >
                                    {officeName}
                                    <FontAwesomeIcon icon={faEdit} className="edit-icon" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* User Profile Section */}
                    {userProfile && (
                        <div className="user-profile" onClick={() => setShowProfileDropdown(!showProfileDropdown)}>
                            <svg className="user-profile-icon" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C11.5 2 11 2.19 10.59 2.59L2.59 10.59C1.8 11.37 1.8 12.63 2.59 13.41L10.59 21.41C11.37 22.2 12.63 22.2 13.41 21.41L21.41 13.41C22.2 12.63 22.2 11.37 21.41 10.59L13.41 2.59C13 2.19 12.5 2 12 2M12 4L20 12L12 20L4 12L12 4M12 7C10.9 7 10 7.9 10 9S10.9 11 12 11 14 10.1 14 9 13.1 7 12 7M12 13C10.67 13 8 13.67 8 15V16H16V15C16 13.67 13.33 13 12 13Z" />
                            </svg>
                            <span className="username">{userProfile.name}</span>

                            {showProfileDropdown && (
                                <div className="profile-dropdown" onClick={(e) => e.stopPropagation()}>
                                    <div className="profile-dropdown-item">
                                        <strong>Name:</strong> {userProfile.name}
                                    </div>
                                    <div className="profile-dropdown-item">
                                        <strong>Employee ID:</strong> {userProfile.employeeId}
                                    </div>
                                    {userProfile.phone && (
                                        <div className="profile-dropdown-item">
                                            <strong>Phone:</strong> {userProfile.phone}
                                        </div>
                                    )}
                                    <div className="profile-dropdown-divider"></div>
                                    <button className="profile-dropdown-button" onClick={handleEditProfile}>
                                        Edit Profile
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </header>

                {/* Page Content Injection */}
                <main className="page-content">
                    <Outlet />
                </main>
            </div>

            {/* First-Time Setup Modal */}
            {showSetupModal && (
                <div className="setup-modal-overlay">
                    <div className="setup-modal-content">
                        <div className="setup-modal-header">
                            <h2>Welcome! Setup Your Profile</h2>
                            <p>Please enter your details to personalize the application</p>
                        </div>
                        <form className="setup-modal-body" onSubmit={handleSetupSubmit}>
                            <div className="form-group">
                                <label>Name <span style={{ color: 'red' }}>*</span></label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={setupForm.name}
                                    onChange={(e) => setSetupForm({ ...setupForm, name: e.target.value })}
                                    placeholder="Enter your full name"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Employee ID <span style={{ color: 'red' }}>*</span></label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={setupForm.employeeId}
                                    onChange={(e) => setSetupForm({ ...setupForm, employeeId: e.target.value })}
                                    placeholder="Enter your employee ID"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Phone Number</label>
                                <input
                                    type="tel"
                                    className="form-input"
                                    value={setupForm.phone}
                                    onChange={(e) => setSetupForm({ ...setupForm, phone: e.target.value })}
                                    placeholder="Enter your phone number (optional)"
                                />
                            </div>
                            <div className="setup-modal-footer">
                                <button type="submit" className="btn btn-primary">
                                    Save Profile
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Layout;
