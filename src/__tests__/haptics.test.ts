/**
 * Tests for haptics helper — verifies gating by user setting + platform check.
 * Mocks: expo-haptics, react-native (Platform), userPreferences.
 */

const mockImpactAsync = jest.fn(async () => {});
const mockNotificationAsync = jest.fn(async () => {});

jest.mock('expo-haptics', () => ({
  impactAsync: mockImpactAsync,
  notificationAsync: mockNotificationAsync,
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

const mockPlatform = { OS: 'ios' as 'ios' | 'android' | 'web' };
jest.mock('react-native', () => ({ Platform: mockPlatform }));

let hapticsEnabled = true;
jest.mock('../utils/userPreferences', () => ({
  getHapticsEnabled: () => hapticsEnabled,
}));

import {
  hapticError,
  hapticHeavy,
  hapticLight,
  hapticMedium,
  hapticSuccess,
} from '../utils/haptics';

beforeEach(() => {
  mockImpactAsync.mockClear();
  mockNotificationAsync.mockClear();
  hapticsEnabled = true;
  mockPlatform.OS = 'ios';
});

describe('haptics helper', () => {
  it('hapticLight calls impactAsync(Light) when enabled', () => {
    hapticLight();
    expect(mockImpactAsync).toHaveBeenCalledWith('light');
  });

  it('hapticMedium calls impactAsync(Medium) when enabled', () => {
    hapticMedium();
    expect(mockImpactAsync).toHaveBeenCalledWith('medium');
  });

  it('hapticHeavy calls impactAsync(Heavy) when enabled', () => {
    hapticHeavy();
    expect(mockImpactAsync).toHaveBeenCalledWith('heavy');
  });

  it('hapticSuccess calls notificationAsync(Success) when enabled', () => {
    hapticSuccess();
    expect(mockNotificationAsync).toHaveBeenCalledWith('success');
  });

  it('hapticError calls notificationAsync(Error) when enabled', () => {
    hapticError();
    expect(mockNotificationAsync).toHaveBeenCalledWith('error');
  });

  it('does NOT fire when getHapticsEnabled() is false', () => {
    hapticsEnabled = false;
    hapticLight();
    hapticMedium();
    hapticHeavy();
    hapticSuccess();
    hapticError();
    expect(mockImpactAsync).not.toHaveBeenCalled();
    expect(mockNotificationAsync).not.toHaveBeenCalled();
  });

  it('does NOT fire on web platform regardless of setting', () => {
    mockPlatform.OS = 'web';
    hapticsEnabled = true;
    hapticLight();
    hapticHeavy();
    hapticSuccess();
    expect(mockImpactAsync).not.toHaveBeenCalled();
    expect(mockNotificationAsync).not.toHaveBeenCalled();
  });
});
