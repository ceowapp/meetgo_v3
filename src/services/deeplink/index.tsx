import { Platform } from 'react-native';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Config from 'react-native-config'; 
import appsFlyer from 'react-native-appsflyer';

export default class DeepLink {
  static STORAGE_KEYS = {
    REFERRAL_CODE: 'REFERRAL_CODE',
    HAS_PROCESSED_APP_OPEN_ATTRIBUTION: 'hasProcessedAppOpenAttribution',
  };

  static ATTRIBUTION_STATUS = {
    NON_ORGANIC: 'Non-organic',
    ORGANIC: 'Organic',
  };

  static async init() {
    try {
      const config = DeepLink.getPlatformConfig();
      if (!DeepLink.validateConfig(config)) {
        console.error('DeepLink Error - Initialization failed: Invalid configuration for platform:', Platform.OS);
        return;
      }
      const appsFlyerOptions: any = {
        devKey: config.devKey,
        isDebug: DeepLink.parseBoolean(Config.IS_TEST_MODE),
        onInstallConversionDataListener: true,
        onDeepLinkListener: true,
        onAppOpenAttributionListener: true,
        timeToWaitForATTUserAuthorization: 10
      };
      if (Platform.OS === 'ios' && config.iosAppId) {
        appsFlyerOptions.appId = config.iosAppId;
      }
      appsFlyer.initSdk(
        appsFlyerOptions,
        (result) => {
          console.log(`✅ AppsFlyer SDK initialized successfully for ${Platform.OS}.`);
          console.log("📦 Initialization result:", JSON.stringify(result, null, 2));
        },
        (error) => {
          console.error(`❌ Failed to initialize AppsFlyer SDK for ${Platform.OS}.`);
          console.error("🚨 Error details:", JSON.stringify(error, null, 2));
        }
      );
      DeepLink.setupDeepLinkListener();
      DeepLink.setupInstallConversionListener();
      await DeepLink.setupAppOpenAttributionListener();
      await DeepLink.handleInitialUrl();
      DeepLink.setupUrlListener();
    } catch (err) {
      console.error('DeepLink Error - Failed to initialize:', err);
    }
  }

  static getPlatformConfig() {
    if (Platform.OS === 'ios') {
      return {
        devKey: Config.IOS_DEV_KEY,
        iosAppId: Config.IOS_APP_ID
      };
    } else {
      return {
        devKey: Config.ANDROID_DEV_KEY
      };
    }
  }

  static validateConfig(config: any) {
    if (!config || !config.devKey || typeof config.devKey !== 'string' || config.devKey.trim().length === 0) {
      console.warn(`DeepLink Config Warning: Missing or invalid DEV_KEY for ${Platform.OS}`);
      return false;
    }
    if (Platform.OS === 'ios') {
      if (!config.iosAppId || typeof config.iosAppId !== 'string' || config.iosAppId.trim().length === 0) {
        console.warn('DeepLink Config Warning: Missing or invalid IOS_APP_ID for iOS');
        return false;
      }
      if (!config.iosAppId.match(/^\d+$/)) {
        console.warn('DeepLink Config Warning: iOS App ID should contain only numbers');
        return false;
      }
    }
    return true;
  }

  static parseBoolean(value: any) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase().trim();
      if (lowerValue === 'true') return true;
      if (lowerValue === 'false') return false;
    }
    return Boolean(value);
  }
 
  static setupDeepLinkListener() {
    try {
      appsFlyer.onDeepLink(deepLinkResult => {
        console.log('DeepLink: AppsFlyer onDeepLink received:', deepLinkResult);
        if (!DeepLink.isValidDeepLinkResult(deepLinkResult)) {
          console.warn('DeepLink - Invalid deep link result received from AppsFlyer.');
          return;
        }
        const deepLinkData = deepLinkResult.data;
        const referralCode = DeepLink.extractReferralCodeFromData(deepLinkData, 'af_refcode');
        if (referralCode) {
          DeepLink.storeReferralCode(referralCode);
          console.log('DeepLink: Stored referral code from AppsFlyer deep link:', referralCode);
        }
      });
    } catch (err) {
      console.error('DeepLink Error - Failed to setup deep link listener:', err);
    }
  }

  static setupInstallConversionListener() {
    try {
      const onInstallConversionDataCanceller = appsFlyer.onInstallConversionData(
        (res) => {
          console.log('DeepLink: AppsFlyer onInstallConversionData received:', res);
          if (res.status === 'failure') {
            console.error('DeepLink: Install conversion data failed:', res.data);
            return;
          }
          if (!DeepLink.isValidInstallConversionData(res)) {
            console.warn('DeepLink - Invalid install conversion data received from AppsFlyer.');
            return;
          }
          DeepLink.handleFirstLaunchAttribution(res.data);
        }
      );
    } catch (err) {
      console.error('DeepLink Error - Failed to setup install conversion listener:', err);
    }
  }

  static async setupAppOpenAttributionListener() {
    try {
      const hasProcessed = await AsyncStorage.getItem(DeepLink.STORAGE_KEYS.HAS_PROCESSED_APP_OPEN_ATTRIBUTION);
      if (hasProcessed !== 'true') {
        appsFlyer.onAppOpenAttribution(attributionData => {
          const openAttributionData = attributionData?.data || {};
          console.log('DeepLink: AppsFlyer app open attribution data:', openAttributionData);
          const referralCode = DeepLink.extractReferralCodeFromData(openAttributionData, 'af_refcode');
          if (referralCode && openAttributionData.af_referrer_customer_id) {
            DeepLink.storeReferralCode(referralCode);
            console.log('DeepLink: Stored referral code from app open attribution:', referralCode);
          }
          AsyncStorage.setItem(DeepLink.STORAGE_KEYS.HAS_PROCESSED_APP_OPEN_ATTRIBUTION, 'true')
            .catch(err => console.error('DeepLink Error - Failed to set hasProcessedAppOpenAttribution flag:', err));
        });
      } else {
        console.log('DeepLink: App open attribution already processed, skipping listener setup.');
      }
    } catch (err) {
      console.error('DeepLink Error - Failed to setup app open attribution listener:', err);
    }
  }

  static async handleInitialUrl() {
    try {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        console.log('DeepLink: Initial URL detected:', initialUrl);
        DeepLink.handleUrl(initialUrl);
      } else {
        console.log('DeepLink: No initial URL found.');
      }
    } catch (err) {
      console.error('DeepLink Error - Failed to handle initial URL:', err);
    }
  }

  static setupUrlListener() {
    try {
      Linking.addEventListener('url', ({ url }) => {
        console.log('DeepLink: URL event received:', url);
        DeepLink.handleUrl(url);
      });
    } catch (err) {
      console.error('DeepLink Error - Failed to setup URL listener:', err);
    }
  }

  static isValidDeepLinkResult(deepLinkResult: any) {
    return (
      deepLinkResult &&
      typeof deepLinkResult === 'object' &&
      deepLinkResult.status === 'success' && 
      deepLinkResult.data &&
      typeof deepLinkResult.data === 'object'
    );
  }

  static isValidInstallConversionData(res: any) {
    return (
      res &&
      typeof res === 'object' &&
      res.data &&
      typeof res.data === 'object'
    );
  }

  static extractReferralCodeFromData(data: any, key: string) {
    if (!data || typeof data !== 'object' || !key) {
      console.warn('DeepLink: Invalid data or key provided for referral code extraction.');
      return null;
    }

    const value = data[key];
    return (typeof value === 'string' && value.trim().length > 0) ? value.trim() : null;
  }

  static handleFirstLaunchAttribution(data: any) {
    try {
      const { af_status, media_source, campaign, af_referrer_customer_id } = data;
      if (af_status === DeepLink.ATTRIBUTION_STATUS.NON_ORGANIC) {
        const referralCode = DeepLink.extractReferralCodeFromData(data, 'af_refcode');
        if (af_referrer_customer_id && referralCode) {
          console.log('DeepLink: Non-organic install with referral code:', referralCode);
          DeepLink.storeReferralCode(referralCode);
        }
        const mediaSourceStr = typeof media_source === 'string' ? media_source : 'Unknown';
        const campaignStr = typeof campaign === 'string' ? campaign : 'Unknown';
        console.log(`DeepLink: First launch - Non-Organic install. Media source: ${mediaSourceStr}, Campaign: ${campaignStr}`);
      } else if (af_status === DeepLink.ATTRIBUTION_STATUS.ORGANIC) {
        console.log('DeepLink: First launch - Organic Install.');
      } else {
        console.log('DeepLink: First launch with unknown attribution status:', af_status);
      }
    } catch (err) {
      console.error('DeepLink Error - Failed to handle first launch attribution:', err);
    }
  }

  static handleUrl(url: string) {
    if (!url || typeof url !== 'string') {
      console.warn('DeepLink - Invalid URL received for handling:', url);
      return;
    }
    try {
      console.log('DeepLink - Attempting to handle URL:', url);
      const referralCode = DeepLink.extractReferralCode(url);
      if (referralCode) {
        DeepLink.storeReferralCode(referralCode);
        console.log('DeepLink: Stored referral code from URL:', referralCode);
      }
    } catch (err) {
      console.error('DeepLink Error - Failed to handle URL:', err, url);
    }
  }

  static extractReferralCode(url: string) {
    if (!url || typeof url !== 'string') {
      console.warn('DeepLink: Invalid URL provided for referral code extraction.');
      return null;
    }
    try {
      const match = url.match(/[?&]ref=([^&]+)/);
      if (match && match[1]) {
        const decoded = decodeURIComponent(match[1]);
        return decoded.trim().length > 0 ? decoded.trim() : null;
      }
      return null;
    } catch (err) {
      console.error('DeepLink Error - Failed to extract referral code from URL:', err);
      return null;
    }
  }

  static async storeReferralCode(code: string) {
    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      console.warn('DeepLink - Invalid referral code provided for storage:', code);
      return false;
    }
    
    try {
      const trimmedCode = code.trim();
      console.log('🔍 DeepLink: About to store referral code:', trimmedCode);
      await AsyncStorage.setItem(DeepLink.STORAGE_KEYS.REFERRAL_CODE, trimmedCode);
      const storedCode = await AsyncStorage.getItem(DeepLink.STORAGE_KEYS.REFERRAL_CODE);
      console.log('✅ DeepLink: Referral code stored and verified:', storedCode);
      
      return true;
    } catch (err) {
      console.error('❌ DeepLink Error - Failed to store referral code:', err);
      return false;
    }
  }

  static async getReferralCode() {
    try {
      console.log('🔍 DeepLink: Attempting to retrieve referral code...');
      const allKeys = await AsyncStorage.getAllKeys();
      console.log('📋 DeepLink: All AsyncStorage keys:', allKeys);
      const code = await AsyncStorage.getItem(DeepLink.STORAGE_KEYS.REFERRAL_CODE);
      console.log('📱 DeepLink: Raw retrieved code:', code);
      console.log('📱 DeepLink: Code type:', typeof code);
      console.log('📱 DeepLink: Storage key used:', DeepLink.STORAGE_KEYS.REFERRAL_CODE);
      const result = (code && typeof code === 'string' && code.trim().length > 0) ? code.trim() : null;
      console.log('✨ DeepLink: Final processed code:', result);
      return result;
    } catch (err) {
      console.error('❌ DeepLink Error - Failed to retrieve referral code:', err);
      return null;
    }
  }

  static async clearReferralCode() {
    try {
      await AsyncStorage.removeItem(DeepLink.STORAGE_KEYS.REFERRAL_CODE);
      console.log('DeepLink: Referral code successfully cleared.');
      return true;
    } catch (err) {
      console.error('DeepLink Error - Failed to clear referral code:', err);
      return false;
    }
  }

  static async hasReferralCode() {
    const code = await DeepLink.getReferralCode();
    return code !== null;
  }

  static async clearAllData() {
    try {
      await Promise.all([
        AsyncStorage.removeItem(DeepLink.STORAGE_KEYS.REFERRAL_CODE),
        AsyncStorage.removeItem(DeepLink.STORAGE_KEYS.HAS_PROCESSED_APP_OPEN_ATTRIBUTION),
      ]);
      console.log('DeepLink: All deep link related data cleared from AsyncStorage.');
      return true;
    } catch (err) {
      console.error('DeepLink Error - Failed to clear all deep link data:', err);
      return false;
    }
  }
}



