import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

const RoleSelectScreen = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to EL-NODE Pay</Text>
      <Text style={styles.subtitle}>Choose your role to continue</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('Login', { role: 'parent' })}
      >
        <Text style={styles.buttonText}>I am a Parent</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, styles.secondaryButton]}
        onPress={() => navigation.navigate('Login', { role: 'accountant' })}
      >
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>I am an Accountant</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  title: {
    fontSize: 24,
    fontFamily: 'Poppins_700Bold',
    color: '#A31F36',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Poppins_400Regular',
    color: '#444444',
    marginBottom: 32,
    textAlign: 'center'
  },
  button: {
    width: '80%',
    backgroundColor: '#A31F36',
    paddingVertical: 16,
    borderRadius: 12,
    marginVertical: 10,
    alignItems: 'center'
  },
  buttonText: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_500Medium',
    fontSize: 16
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#A31F36'
  },
  secondaryButtonText: {
    color: '#A31F36'
  }
});

export default RoleSelectScreen;
