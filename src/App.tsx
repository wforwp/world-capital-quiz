import { useState, useEffect, useRef } from 'react'
import './App.css'
import COUNTRY_CAPITALS_DATA from './data/countries.json'
import wcqImage from './assets/wcq.png'

type Screen = 'main' | 'difficulty' | 'game' | 'gameOver' | 'help'
type Difficulty = 'easy' | 'medium' | 'hard'

interface Question {
  country: string
  capital: string
  options: string[]
  difficulty?: 'easy' | 'medium' | 'hard'
}

interface CountryCapital {
  country: string
  capital: string
  difficulty?: 'easy' | 'medium' | 'hard'
}

const COUNTRY_CAPITALS: CountryCapital[] = COUNTRY_CAPITALS_DATA as CountryCapital[]

// AudioContext를 한 번만 생성하고 재사용
let audioContext: AudioContext | null = null

const getAudioContext = (): AudioContext | null => {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    // suspended 상태면 resume
    if (audioContext.state === 'suspended') {
      audioContext.resume()
    }
    return audioContext
  } catch (error) {
    console.warn('AudioContext 생성 실패:', error)
    return null
  }
}

// 효과음 재생 함수
const playSound = (type: 'correct' | 'wrong' | 'timeout' | 'click') => {
  try {
    const audioContext = getAudioContext()
    if (!audioContext) return
    
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    
    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    
    // 효과음 타입에 따라 다른 주파수와 패턴 설정
    if (type === 'correct') {
      // 정답: 상승하는 멜로디 (도-미-솔)
      oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime) // C5
      oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1) // E5
      oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2) // G5
      oscillator.type = 'sine'
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.3)
    } else if (type === 'wrong') {
      // 오답: 낮은 톤의 부저음
      oscillator.frequency.value = 200
      oscillator.type = 'sawtooth'
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.2)
    } else if (type === 'timeout') {
      // 시간 초과: 경고음 (부드러운 비프음 2번)
      oscillator.frequency.value = 300
      oscillator.type = 'sine'
      gainNode.gain.setValueAtTime(0.35, audioContext.currentTime)
      gainNode.gain.setValueAtTime(0, audioContext.currentTime + 0.1)
      gainNode.gain.setValueAtTime(0.35, audioContext.currentTime + 0.15)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25)
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.25)
    } else if (type === 'click') {
      // 버튼 클릭: 짧고 부드러운 클릭음
      oscillator.frequency.value = 600
      oscillator.type = 'sine'
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1)
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.1)
    }
  } catch (error) {
    // 오디오 컨텍스트 생성 실패 시 무시 (사용자가 아직 상호작용하지 않은 경우 등)
    console.warn('효과음 재생 실패:', error)
  }
}

// 로컬 스토리지에서 최고 점수 가져오기
const getHighScore = (): number => {
  try {
    const stored = localStorage.getItem('highScore')
    return stored ? parseInt(stored, 10) : 0
  } catch {
    return 0
  }
}

// 최고 점수 저장하기
const saveHighScore = (score: number): void => {
  try {
    const currentHigh = getHighScore()
    if (score > currentHigh) {
      localStorage.setItem('highScore', score.toString())
    }
  } catch {
    // 로컬 스토리지 저장 실패 시 무시
  }
}

function App() {
  const [screen, setScreen] = useState<Screen>('main')
  const [speedMode, setSpeedMode] = useState<boolean>(false)
  const [score, setScore] = useState<number>(0)
  const [hearts, setHearts] = useState<number>(3)
  const [questionNumber, setQuestionNumber] = useState<number>(1)
  const [combo, setCombo] = useState<number>(0)
  const [timeLeft, setTimeLeft] = useState<number>(10)
  const [currentDifficulty, setCurrentDifficulty] = useState<Difficulty>('easy')
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [isAnswered, setIsAnswered] = useState<boolean>(false)
  const [feedback, setFeedback] = useState<string>('')
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null)
  const [helpPage, setHelpPage] = useState<number>(0)
  const [highScore, setHighScore] = useState<number>(0)
  const [showHighScore, setShowHighScore] = useState<boolean>(false)
  
  const timerRef = useRef<number | null>(null)
  const screenRef = useRef<Screen>('main')
  const timeoutHandledRef = useRef<boolean>(false)

  // screen 상태가 변경될 때마다 ref 업데이트
  useEffect(() => {
    screenRef.current = screen
  }, [screen])

  // 최고 점수 로드
  useEffect(() => {
    setHighScore(getHighScore())
  }, [])

  // 브라우저 뒤로가기 처리
  useEffect(() => {
    // 초기 상태 설정 - 더미 항목을 먼저 추가하여 앱 종료 방지
    if (window.history.state === null) {
      // 더미 항목 추가 (앱 종료 방지용)
      window.history.replaceState({ screen: 'dummy' }, '', window.location.href)
      // 실제 메인 화면 항목 추가
      window.history.pushState({ screen: 'main' }, '', window.location.href)
    }

    // popstate 이벤트 리스너 (뒤로가기/앞으로가기)
    const handlePopState = (event: PopStateEvent) => {
      // 더미 항목으로 돌아가면 다시 메인 화면으로 push
      if (event.state && event.state.screen === 'dummy') {
        window.history.pushState({ screen: 'main' }, '', window.location.href)
        setScreen('main')
        return
      }

      // 메인 화면에서 뒤로가기를 누르면 더미 항목으로 가지만, 즉시 메인으로 다시 push
      if (screen === 'main') {
        if (event.state && event.state.screen === 'dummy') {
          window.history.pushState({ screen: 'main' }, '', window.location.href)
          setScreen('main')
        } else {
          // 예상치 못한 경우에도 메인 화면 유지
          window.history.pushState({ screen: 'main' }, '', window.location.href)
        }
        return
      }

      // 난이도 선택 화면에서 뒤로가기를 누른 경우
      if (screen === 'difficulty') {
        if (event.state && event.state.screen === 'main') {
          setScreen('main')
        } else if (event.state && event.state.screen === 'dummy') {
          window.history.pushState({ screen: 'main' }, '', window.location.href)
          setScreen('main')
        } else {
          setScreen('main')
          window.history.pushState({ screen: 'main' }, '', window.location.href)
        }
        return
      }

      // 게임 화면에서 뒤로가기를 누른 경우
      if (screen === 'game') {
        if (event.state && event.state.screen === 'difficulty') {
          setScreen('difficulty')
        } else if (event.state && event.state.screen === 'main') {
          setScreen('main')
        } else {
          setScreen('difficulty')
          window.history.pushState({ screen: 'difficulty' }, '', window.location.href)
        }
        return
      }

      // 도움말 화면에서 뒤로가기를 누른 경우
      if (screen === 'help') {
        if (event.state && event.state.screen === 'main') {
          setScreen('main')
        } else {
          setScreen('main')
          window.history.pushState({ screen: 'main' }, '', window.location.href)
        }
        return
      }

      if (event.state && event.state.screen) {
        // 다른 화면이면 해당 화면으로 이동
        if (event.state.screen === 'main') {
          setScreen('main')
        } else if (event.state.screen === 'difficulty') {
          setScreen('difficulty')
        } else if (event.state.screen === 'game') {
          setScreen('game')
        } else if (event.state.screen === 'help') {
          setScreen('help')
        } else {
          setScreen('main')
          window.history.pushState({ screen: 'main' }, '', window.location.href)
        }
      } else {
        setScreen('main')
        window.history.pushState({ screen: 'main' }, '', window.location.href)
      }
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [screen])

  const handleStart = () => {
    playSound('click')
    setScreen('difficulty')
    // history에 상태 추가
    window.history.pushState({ screen: 'difficulty' }, '', window.location.href)
  }

  const handleBack = () => {
    // 메인 화면이 아니면 뒤로가기
    if (screen === 'difficulty') {
      setScreen('main')
      window.history.pushState({ screen: 'main' }, '', window.location.href)
    } else if (screen === 'game') {
      // 타이머 정리
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      setScreen('difficulty')
      window.history.pushState({ screen: 'difficulty' }, '', window.location.href)
    }
  }

  // 문제 생성 함수
  const generateQuestion = (difficulty: Difficulty, questionNumber: number): Question => {
    // 난이도와 문제 번호에 따라 사용 가능한 국가 필터링
    let availableCountries = COUNTRY_CAPITALS
    
    if (difficulty === 'easy') {
      if (questionNumber <= 20) {
        // 1-20문제: easy만
        availableCountries = COUNTRY_CAPITALS.filter(c => c.difficulty === 'easy')
      } else if (questionNumber <= 40) {
        // 21-40문제: easy + medium
        availableCountries = COUNTRY_CAPITALS.filter(c => c.difficulty === 'easy' || c.difficulty === 'medium')
      } else {
        // 41문제 이상: 모든 난이도
        availableCountries = COUNTRY_CAPITALS
      }
    } else if (difficulty === 'medium') {
      if (questionNumber <= 30) {
        // 1-30문제: easy + medium
        availableCountries = COUNTRY_CAPITALS.filter(c => c.difficulty === 'easy' || c.difficulty === 'medium')
      } else {
        // 31문제 이상: 모든 난이도
        availableCountries = COUNTRY_CAPITALS
      }
    } else if (difficulty === 'hard') {
      // 어려움: 처음부터 모든 난이도
      availableCountries = COUNTRY_CAPITALS
    }
    
    // 사용 가능한 국가 중에서 랜덤 선택
    const randomIndex = Math.floor(Math.random() * availableCountries.length)
    const correct = availableCountries[randomIndex]
    
    // 정답을 제외한 다른 수도들 중에서 3개 선택 (전체 목록에서 선택)
    const otherCapitals = COUNTRY_CAPITALS
      .filter(item => item.capital !== correct.capital)
      .map(item => item.capital)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
    
    // 정답과 오답을 섞어서 4개의 선택지 생성
    const options = [correct.capital, ...otherCapitals].sort(() => Math.random() - 0.5)
    
    return {
      country: correct.country,
      capital: correct.capital,
      options,
      difficulty: correct.difficulty || 'easy'
    }
  }

  // 난이도에 따른 점수 계산 함수
  const getScoreByDifficulty = (difficulty?: 'easy' | 'medium' | 'hard'): number => {
    switch (difficulty) {
      case 'easy': return 10
      case 'medium': return 20
      case 'hard': return 30
      default: return 10
    }
  }

  // Combo에 따른 배율 계산 함수
  const getComboMultiplier = (combo: number): number => {
    if (combo < 3) return 1.0
    if (combo < 5) return 1.2
    if (combo < 10) return 1.5
    if (combo < 20) return 2.0
    return 2.5
  }

  // 모드(난이도)에 따른 배율 계산 함수
  const getModeMultiplier = (difficulty: Difficulty): number => {
    switch (difficulty) {
      case 'easy': return 1.0
      case 'medium': return 1.2
      case 'hard': return 1.5
      default: return 1.0
    }
  }

  // 난이도에 따른 타이머 시간 반환
  const getTimeByDifficulty = (difficulty: Difficulty): number => {
    switch (difficulty) {
      case 'easy': return 7
      case 'medium': return 4
      case 'hard': return 2
      default: return 7
    }
  }

  // 게임 시작
  const startGame = (difficulty: Difficulty) => {
    setCurrentDifficulty(difficulty)
    setScore(0)
    setHearts(3)
    setQuestionNumber(1)
    setCombo(0)
    setIsAnswered(false)
    setSelectedAnswer(null)
    setFeedback('')
    setCorrectAnswer(null)
    const question = generateQuestion(difficulty, 1)
    setCurrentQuestion(question)
    const time = getTimeByDifficulty(difficulty)
    setTimeLeft(time)
    setScreen('game')
    window.history.pushState({ screen: 'game' }, '', window.location.href)
  }

  // 다음 문제로 이동
  const nextQuestion = () => {
    if (hearts <= 0) {
      setScreen('gameOver')
      return
    }
    
    setQuestionNumber(prev => {
      const newNumber = prev + 1
    setIsAnswered(false)
    setSelectedAnswer(null)
    setFeedback('')
    setCorrectAnswer(null)
      const question = generateQuestion(currentDifficulty, newNumber)
    setCurrentQuestion(question)
    const time = getTimeByDifficulty(currentDifficulty)
    setTimeLeft(time)
      return newNumber
    })
  }

  // 정답 처리
  const handleAnswer = (answer: string) => {
    if (isAnswered) return
    
    setIsAnswered(true)
    setSelectedAnswer(answer)
    
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    
    const delay = speedMode ? 500 : 1500
    const wrongDelay = speedMode ? 500 : 2000
    
    if (answer === currentQuestion?.capital) {
      // 정답: combo 증가
      setCombo(prev => {
        const newCombo = prev + 1
        const basePoints = getScoreByDifficulty(currentQuestion?.difficulty)
        const modeMultiplier = getModeMultiplier(currentDifficulty)
        const comboMultiplier = getComboMultiplier(newCombo)
        const finalPoints = Math.floor(basePoints * modeMultiplier * comboMultiplier)
        setScore(prevScore => prevScore + finalPoints)
        return newCombo
      })
      setFeedback('정답입니다!')
      playSound('correct')
      setTimeout(() => {
        nextQuestion()
      }, delay)
    } else {
      // 오답: combo 리셋
      setCombo(0)
      setFeedback('틀렸습니다!')
      playSound('wrong')
      setCorrectAnswer(currentQuestion?.capital || null)
      setHearts(prev => {
        const newHearts = prev - 1
        if (newHearts <= 0) {
          setTimeout(() => {
            setScreen('gameOver')
          }, delay)
        } else {
          setTimeout(() => {
            nextQuestion()
          }, wrongDelay)
        }
        return newHearts
      })
    }
  }

  // 타이머 useEffect
  useEffect(() => {
    if (screen === 'game' && currentQuestion && !isAnswered) {
      // 새로운 문제가 시작될 때 timeoutHandled 리셋
      timeoutHandledRef.current = false
      
      // 타이머 함수
      const tick = () => {
        // 이미 답변했거나 시간 초과 처리가 완료된 경우 무시
        if (isAnswered || timeoutHandledRef.current) {
          return
        }
        
        setTimeLeft(prev => {
          if (prev <= 0) {
            // 이미 시간 초과 처리됨
            return 0
          }
          
          const newTime = prev - 1
          
          if (newTime <= 0 && !timeoutHandledRef.current) {
            // 시간 초과 처리 (한 번만 실행)
            timeoutHandledRef.current = true
            
            if (timerRef.current) {
              clearInterval(timerRef.current)
              timerRef.current = null
            }
            setIsAnswered(true)
            setFeedback('시간 초과입니다!')
            playSound('timeout')
            setCombo(0) // 시간 초과 시 combo 리셋
            setCorrectAnswer(currentQuestion.capital)
            setHearts(prevHearts => {
              const newHearts = prevHearts - 1
              const delay = speedMode ? 500 : 1500
              const wrongDelay = speedMode ? 500 : 2000
              if (newHearts <= 0) {
                setTimeout(() => {
                  setScreen('gameOver')
                }, delay)
              } else {
                setTimeout(() => {
                  nextQuestion()
                }, wrongDelay)
              }
              return newHearts
            })
            return 0
          }
          return newTime
        })
      }
      
      // 1초 후에 첫 번째 틱 실행 (전체가 보이는 상태에서 시작)
      timerRef.current = window.setInterval(tick, 1000)
      
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
      }
    }
  }, [screen, currentQuestion, isAnswered, currentDifficulty])

  // 게임 오버 시 최고 점수 저장
  useEffect(() => {
    if (screen === 'gameOver' && score > 0) {
      saveHighScore(score)
      setHighScore(getHighScore())
    }
  }, [screen, score])

  const handleDifficulty = (difficulty: 'easy' | 'medium' | 'hard') => {
    playSound('click')
    startGame(difficulty)
  }

  const handleScores = () => {
    playSound('click')
    setShowHighScore(true)
  }

  const helpPages = [
    {
      title: '게임 소개',
      content: '나라별 수도 맞추기 게임에\n오신걸 환영합니다!\n\n주어진 나라의 수도가 어디인지\n4개의 선택지 중에서 고르는\n게임입니다.'
    },
    {
      title: '난이도 선택',
      content: '쉬움: 7초, 기본 10점\n보통: 4초, 기본 20점\n어려움: 2초, 기본 30점\n\n난이도가 높을수록\n기본 점수와 모드 배율이\n더 높아집니다!'
    },
    {
      title: '점수 계산',
      content: '최종 점수 = 기본 점수\n× Combo 배율\n× 모드 배율\n\n• 쉬움: 모드 배율 1.0배\n• 보통: 모드 배율 1.2배\n• 어려움: 모드 배율 1.5배'
    },
    {
      title: 'Combo 시스템',
      content: '연속으로 정답을 맞추면\nCombo가 쌓입니다!\n\n• Combo 3 이상: 1.2배\n• Combo 5 이상: 1.5배\n• Combo 10 이상: 2.0배\n• Combo 20 이상: 2.5배\n\n틀리거나 시간 초과 시\nCombo가 리셋됩니다.'
    },
    {
      title: '하트 시스템',
      content: '하트는 3개가 주어집니다.\n\n틀리거나 시간 초과 시\n하트가 하나씩 감소합니다.\n\n모든 하트가 소진되면\n게임 오버입니다.'
    },
    {
      title: '스피드 모드',
      content: '스피드 모드를 켜면\n피드백 메시지 후 다음 문제로\n넘어가는 시간이 0.5초로\n단축됩니다.\n\n빠른 게임 플레이를 원한다면\n스피드 모드를 활용해보세요!'
    },
    {
      title: '최고 점수',
      content: '게임 오버 시\n점수가 자동으로\n로컬 스토리지에 저장됩니다.\n\n메인 화면의 "점수보기" 버튼으로\n최고 점수를 확인할 수 있습니다.'
    },
    {
      title: '게임 팁',
      content: '• 빠르고 정확하게 답 선택\n• 시간 부족 시 직감 활용\n• 연속 정답으로 Combo 쌓기\n• 어려운 난이도로 높은 점수\n• 스피드 모드로 빠른 플레이\n\n화이팅!'
    }
  ]

  const handleHelp = () => {
    playSound('click')
    setHelpPage(0)
    setScreen('help')
    window.history.pushState({ screen: 'help' }, '', window.location.href)
  }

  const handleHelpPrev = () => {
    setHelpPage(prev => (prev > 0 ? prev - 1 : helpPages.length - 1))
  }

  const handleHelpNext = () => {
    setHelpPage(prev => (prev < helpPages.length - 1 ? prev + 1 : 0))
  }

  if (showHighScore) {
    return (
      <div className="main-container">
        <div className="top-bar">
          <button className="back-button" onClick={() => {
            playSound('click')
            setShowHighScore(false)
          }}>
            ←
          </button>
        </div>
        <div className="logo-container">
          <img src={wcqImage} alt="World Capital Quiz" className="main-logo no-animation" />
        </div>
        <h1 className="game-title">최고 점수</h1>
        <div className="high-score-display">
          <div className="high-score-value">{highScore}</div>
          <div className="high-score-label">점</div>
        </div>
        <div className="button-container">
          <button className="main-button start-button" onClick={() => {
            playSound('click')
            setShowHighScore(false)
          }}>
            돌아가기
          </button>
        </div>
      </div>
    )
  }

  if (screen === 'help') {
    return (
      <div className="main-container">
        <div className="top-bar">
          <button className="back-button" onClick={() => {
            setScreen('main')
            window.history.pushState({ screen: 'main' }, '', window.location.href)
          }}>
            ←
          </button>
        </div>
        <div className="help-header">
          <h1 className="help-title">도움말</h1>
        </div>
        <div className="help-container">
          <div className="help-content">
            <button className="help-nav-button help-nav-prev" onClick={handleHelpPrev}></button>
            <div className="help-page">
              <h2 className="help-page-title">{helpPages[helpPage].title}</h2>
              <p className="help-page-content">{helpPages[helpPage].content}</p>
            </div>
            <button className="help-nav-button help-nav-next" onClick={handleHelpNext}></button>
          </div>
          <div className="help-dots">
            {helpPages.map((_, index) => (
              <button
                key={index}
                className={`help-dot ${index === helpPage ? 'active' : ''}`}
                onClick={() => setHelpPage(index)}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'gameOver') {
    return (
      <div className="game-over-overlay">
        <div className="game-over-modal">
          <h2 className="game-over-title">Game Over</h2>
          <div className="game-over-score">
            <div className="final-score-label">Total Score</div>
            <div className="final-score-value">{score}</div>
            {score === highScore && score > 0 && (
              <div className="new-record-badge">🎉 신기록! 🎉</div>
            )}
          </div>
          <div className="game-over-buttons">
            <button 
              className="game-over-button main-button game-over-main-button"
              onClick={() => {
                setScreen('main')
                window.history.pushState({ screen: 'main' }, '', window.location.href)
              }}
            >
              첫 화면으로
            </button>
            <button 
              className="game-over-button main-button game-over-retry-button"
              onClick={() => {
                startGame(currentDifficulty)
              }}
            >
              다시하기
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'game') {
    if (!currentQuestion) {
      // 문제가 없으면 생성
      const question = generateQuestion(currentDifficulty, questionNumber)
      setCurrentQuestion(question)
      const time = getTimeByDifficulty(currentDifficulty)
      setTimeLeft(time)
      return null
    }
    
    const maxTime = getTimeByDifficulty(currentDifficulty)
    
    return (
      <div className="game-container">
        <div className="top-bar">
          <button className="back-button" onClick={handleBack}>
            ←
          </button>
        </div>
        {combo > 0 && (
          <div className="combo-display" style={{ 
            position: 'absolute',
            top: '77px',
            left: '1rem',
            fontSize: combo >= 10 ? '18px' : '16px',
            fontWeight: 'bold',
            color: combo >= 10 ? '#FFD700' : combo >= 5 ? '#FF6B6B' : '#4ECDC4',
          }}>
            {combo} Combo!
          </div>
        )}
        <div className="game-info-bar">
          <div className="hearts-container">
            {Array.from({ length: 3 }).map((_, index) => (
              <span 
                key={index} 
                className="heart-icon"
                style={{ opacity: index < hearts ? 1 : 0.3 }}
              >
                ❤️
              </span>
            ))}
          </div>
          <div className="score-display">
            <div className="score-label">score</div>
            <div className="score-value">{score}</div>
          </div>
        </div>
        <div className="question-box">
          <div className="question-number">문제 {questionNumber}</div>
          <p className="question-text">{currentQuestion.country}의 수도는?</p>
          {feedback && (
            <div className={`feedback-message ${feedback.includes('정답') ? 'correct' : 'incorrect'}`}>
              {feedback}
            </div>
          )}
        </div>
        <div className="timer-box">
          <div className="timer-segments">
            {Array.from({ length: maxTime }).map((_, index) => (
              <div
                key={index}
                className={`timer-segment ${index < timeLeft ? 'active' : 'inactive'}`}
              ></div>
            ))}
          </div>
        </div>
        <div className="answer-buttons">
          {currentQuestion.options.map((option, index) => {
            const isCorrect = option === currentQuestion.capital
            const isSelected = option === selectedAnswer
            const showCorrect = isAnswered && (correctAnswer === option || (isSelected && isCorrect))
            
            return (
              <button
                key={index}
                className={`answer-button ${
                  showCorrect ? 'correct-answer' : 
                  isSelected && !isCorrect ? 'wrong-answer' : ''
                }`}
                onClick={() => handleAnswer(option)}
                disabled={isAnswered}
              >
                {option}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (screen === 'difficulty') {
    return (
      <div className="main-container">
        <div className="top-bar">
          <button className="back-button" onClick={handleBack}>
            ←
          </button>
        </div>
        <div className="logo-container">
          <img src={wcqImage} alt="World Capital Quiz" className="main-logo no-animation" />
        </div>
        <h1 className="game-title">난이도 선택</h1>
        <div className="button-container">
          <button 
            className="main-button difficulty-button easy-button" 
            onClick={() => handleDifficulty('easy')}
          >
            쉬움 (7초)
          </button>
          <button 
            className="main-button difficulty-button medium-button" 
            onClick={() => handleDifficulty('medium')}
          >
            보통 (4초)
          </button>
          <button 
            className="main-button difficulty-button hard-button" 
            onClick={() => handleDifficulty('hard')}
          >
            어려움 (2초)
          </button>
        </div>
        <div className="speed-mode-container">
          <span className="speed-mode-text">스피드 모드</span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={speedMode}
              onChange={(e) => setSpeedMode(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>
    )
  }

  return (
    <div className="main-container">
      <div className="top-bar"></div>
      <div className="logo-container">
        <img src={wcqImage} alt="World Capital Quiz" className="main-logo" />
      </div>
      <h1 className="game-title">나라별 수도 맞추기</h1>
      <div className="button-container">
        <button className="main-button start-button" onClick={handleStart}>
          시작하기
        </button>
        <button className="main-button scores-button" onClick={handleScores}>
          점수보기
        </button>
        <button className="main-button help-button" onClick={handleHelp}>
          도움말
        </button>
      </div>
      <p className="company-text">Dev Insight Inc.</p>
    </div>
  )
}

export default App
