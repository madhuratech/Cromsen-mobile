import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity, Platform, StatusBar, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShoppingBag, ArrowRight, ArrowLeft } from 'lucide-react-native';
import { THEME_COLORS } from '../theme';
import { CartItem, AppButton, EmptyState } from '../components';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';
import { BackIcon } from '../components/CustomIcons';
import { useFocusEffect } from '@react-navigation/native';
import { productService } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function CartScreen({ navigation }) {
  const { cartItems: items, removeFromCart: remove, updateQuantity: updateQty, setCartItems } = useCart();
  const { isDarkMode, theme } = useTheme();
  const { user } = useAuth();
  
  const [liveItems, setLiveItems] = useState(items);
  const [refreshingPrices, setRefreshingPrices] = useState(false);

  // Derive a string from items to safely trigger updates
  const itemsStr = JSON.stringify(items);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const refreshLivePrices = async () => {
        if (!items || items.length === 0) {
          if (isActive) setLiveItems([]);
          return;
        }
        
        try {
          if (isActive) setRefreshingPrices(true);
          const parseNum = (v) => (typeof v === 'number' ? v : parseFloat(v) || 0);
          const userRole = (user?.role || user?.userType || user?.type || 'retailer').toLowerCase();

          const updatedItems = await Promise.all(items.map(async (item) => {
            let freshProd = null;
            if (typeof productService !== 'undefined') {
              freshProd = await productService.getProductById(item.id || item._id).catch(() => null);
            }
            if (!freshProd) return item; // Fallback to cached item if network fails

            let freshPrice = 0;
            const isCustomSqFt = freshProd.isCustomSizeEnabled && item.sqFt && item.sqFt !== '1' && item.sqFt !== 1;
            
            if (isCustomSqFt) {
               freshPrice = userRole === 'dealer' ? parseNum(freshProd.pricePerSqFtDealer) : parseNum(freshProd.pricePerSqFtRetail);
            }
            if (!freshPrice || freshPrice <= 0) {
               freshPrice = userRole === 'dealer' ? parseNum(freshProd.dealerPrice) : parseNum(freshProd.retailPrice);
            }
            if (freshPrice <= 0) freshPrice = parseNum(freshProd.price);

            const variantItems = freshProd.variantItems || freshProd.variantPrices || [];
            let targetVar = null;
            if (variantItems.length > 0) {
              if (item.variant) {
                const selectedOptions = item.variant.split(', ').map(s => s.split(': ')[1]).filter(Boolean);
                targetVar = variantItems.find(vp => {
                   if (!vp.combination) return false;
                   return selectedOptions.every(opt => vp.combination.includes(opt));
                });
              }
              if (!targetVar) targetVar = variantItems[0];
            }

            const feeCgst = targetVar && targetVar.cgst !== undefined ? targetVar.cgst : freshProd.cgst;
            const feeSgst = targetVar && targetVar.sgst !== undefined ? targetVar.sgst : freshProd.sgst;
            const feePkg = targetVar && (targetVar.packagingFee !== undefined || targetVar.packagingPrice !== undefined) ? (targetVar.packagingFee !== undefined ? targetVar.packagingFee : targetVar.packagingPrice) : (freshProd.packagingFee !== undefined ? freshProd.packagingFee : freshProd.packagingPrice);
            const feeShip = targetVar && (targetVar.shippingFee !== undefined || targetVar.shippingPrice !== undefined) ? (targetVar.shippingFee !== undefined ? targetVar.shippingFee : targetVar.shippingPrice) : (freshProd.shippingFee !== undefined ? freshProd.shippingFee : freshProd.shippingPrice);
            const feeInst = targetVar && (targetVar.installationFee !== undefined || targetVar.installationPrice !== undefined) ? (targetVar.installationFee !== undefined ? targetVar.installationFee : targetVar.installationPrice) : (freshProd.installationFee !== undefined ? freshProd.installationFee : freshProd.installationPrice);

            return {
              ...item,
              price: freshPrice > 0 ? freshPrice : item.price,
              cgst: parseNum(feeCgst),
              sgst: parseNum(feeSgst),
              packagingFee: parseNum(feePkg),
              shippingFee: parseNum(feeShip),
              installationFee: parseNum(feeInst),
            };
          }));

          if (isActive) {
            // Check if prices actually changed to avoid unnecessary re-renders
            if (JSON.stringify(updatedItems) !== JSON.stringify(liveItems)) {
              setLiveItems(updatedItems);
            }
          }
        } catch (e) {
          console.warn('Failed to refresh cart prices', e);
        } finally {
          if (isActive) setRefreshingPrices(false);
        }
      };

      refreshLivePrices();
      return () => { isActive = false; };
    }, [itemsStr, user])
  );

  const subtotal = Array.isArray(liveItems) 
    ? liveItems.reduce((s, i) => s + (Number(i?.price) || 0) * (Number(i?.sqFt) || 1) * (Number(i?.quantity) || 0), 0)
    : 0;
  const totalInstallation = Array.isArray(liveItems)
    ? liveItems.reduce((s, i) => s + (Number(i?.installationPrice) || 0) * (Number(i?.quantity) || 0), 0)
    : 0;
  const discount = 0;
  const totalPackaging = Array.isArray(liveItems)
    ? liveItems.reduce((s, i) => s + (Number(i?.packagingFee) || 0) * (Number(i?.quantity) || 0), 0)
    : 0;
  const totalShipping = Array.isArray(liveItems)
    ? liveItems.reduce((s, i) => s + (Number(i?.shippingFee) || 0) * (Number(i?.quantity) || 0), 0)
    : 0;
  const totalCgst = Array.isArray(liveItems)
    ? liveItems.reduce((s, i) => s + ((Number(i?.price) || 0) * (Number(i?.sqFt) || 1) * (Number(i?.quantity) || 0)) * ((Number(i?.cgst) || 0) / 100), 0)
    : 0;
  const totalSgst = Array.isArray(liveItems)
    ? liveItems.reduce((s, i) => s + ((Number(i?.price) || 0) * (Number(i?.sqFt) || 1) * (Number(i?.quantity) || 0)) * ((Number(i?.sgst) || 0) / 100), 0)
    : 0;

  const total = subtotal - discount + totalPackaging + totalShipping + totalCgst + totalSgst + totalInstallation;

  if (items.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={theme.surface} />

        <EmptyState
          icon={<ShoppingBag size={52} color={THEME_COLORS.border} />}
          title="Your bag is empty"
          subtitle="Browse and add items to start shopping."
          action={
            <AppButton
              title="Continue Shopping"
              onPress={() => navigation.navigate('HomeTab')}
              size="md"
            />
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: isDarkMode ? '#2C3E50' : '#F8FAFC' }]}>
          <ArrowLeft size={20} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>My Cart</Text>
        <View style={{ width: 40 }} /> 
      </View>



      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Order summary label */}
        <View style={styles.summaryHeader}>
          <Text style={[styles.summaryLabel, { color: theme.text }]}>Order Summary</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {refreshingPrices && <ActivityIndicator size="small" color={theme.primary} style={{ marginRight: 8 }} />}
            <Text style={[styles.itemCount, { color: theme.primary }]}>{liveItems.length} ITEMS</Text>
          </View>
        </View>

        {/* Cart Items */}
        {liveItems.map(item => (
          <CartItem
            key={item.id}
            item={item}
            onRemove={() => remove(item.id)}
            onIncrease={() => updateQty(item.id, 1)}
            onDecrease={() => updateQty(item.id, -1)}
          />
        ))}

        {/* Bill Details */}
        <View style={styles.billCard}>
          <BillRow label={`Price (${liveItems.length} item${liveItems.length > 1 ? 's' : ''})`} value={`₹${subtotal.toLocaleString()}`} />
          {totalInstallation > 0 && (
            <BillRow label="Installation Fee" value={`₹${totalInstallation.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} />
          )}
          {totalPackaging > 0 && (
            <BillRow label="Secured Packaging Fee" value={`₹${totalPackaging.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} />
          )}
          {totalShipping > 0 && (
            <BillRow label="Shipping Fee" value={`₹${totalShipping.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} />
          )}
          {totalCgst > 0 && (
            <BillRow label="CGST" value={`₹${totalCgst.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} />
          )}
          {totalSgst > 0 && (
            <BillRow label="SGST" value={`₹${totalSgst.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} />
          )}
          <View style={styles.totalDivider} />
          <BillRow label="Total Amount" value={`₹${total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} bold />
        </View>
      </ScrollView>

      {/* Checkout Footer */}
      <View style={[styles.footer, { paddingBottom: Platform.OS === 'ios' ? 100 : 90 }]}>
        <AppButton
          title="Proceed to Checkout"
          onPress={() => navigation.navigate('Checkout')}
          size="lg"
          style={styles.checkoutBtn}
          icon={<ArrowRight size={18} color={THEME_COLORS.surface} />}
          iconPosition="right"
        />
      </View>
    </SafeAreaView>
  );
}

function BillRow({ label, value, valueColor, bold }) {
  return (
    <View style={bStyles.row}>
      <Text style={[bStyles.label, bold && bStyles.bold]}>{label}</Text>
      <Text style={[bStyles.value, bold && bStyles.bold, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const bStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  label: { fontSize: 14, color: THEME_COLORS.textSecondary },
  value: { fontSize: 14, fontWeight: '700', color: THEME_COLORS.text },
  bold: { fontWeight: '900', fontSize: 16, color: THEME_COLORS.text },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME_COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: THEME_COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: THEME_COLORS.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: THEME_COLORS.primary, flex: 1, textAlign: 'center' },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center',
  },

  scroll: { padding: 16, paddingBottom: 20 },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  summaryLabel: { fontSize: 16, fontWeight: '700', color: THEME_COLORS.text },
  itemCount: { fontSize: 12, fontWeight: '700', color: THEME_COLORS.primary },

  billCard: { marginTop: 8 },
  totalDivider: { height: 1, backgroundColor: THEME_COLORS.border, marginBottom: 14, marginTop: 2 },

  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: 'transparent' },
  checkoutBtn: {
    backgroundColor: THEME_COLORS.primary,
    borderRadius: 12,
  },
});
