---
title: 俺的Python零基础入门
published: 2026-10-01T12:00:00+08:00
pinned: false
description: 一个零基础新生的 Python 学习记录：从 print 一句"Hello, World!"开始，一路啃到变量、条件、列表、字典、循环、函数、类和文件读取，十六关每关都配本尊亲手写的（自称能跑的）代码，附"屎山写法"反面教材一处。
tags:
  - Python
  - 学习记录
  - 零基础
  - 编程入门
category: 编程学习
slug: python-zero-to-hero
series: "Python零基础"
---

## 观前必看

这篇不是教程，就是一个零基础菜鸟的学习记录。

**零基础学 Python 的真谛就是先跑起来，再懂不懂。这个顺序不能反。**

所有代码都是本尊一行行手敲的，写法未必标准（说实话有些本尊自己也不知道为什么要这么写，但它就是跑通了）喵~

---

## 一、print

第一关的内容是把字符串塞进括号里打印。听起来幼儿园水平，但第一天就有坑喵~

```python
print("Hello, World!")
print("Dad!!\nDad!!!")        # \n 换行
print("666" + ",你好")          # 字符串用 + 直接拼
print('Let\'s go!')            # 单引号里再出现单引号，得加 \ 转义（这个坑本尊踩过）
```

最有排面的是三引号，整段整段往外抛：

```python
print("""君不见黄河之水天上来，奔流到海不复回。
君不见高堂明镜悲白发，朝如青丝暮成雪。
人生得意须尽欢，莫使金樽空对月。""")
```

对，本尊用刚学会的第一个函数背了半首《将进酒》。别问学到了什么，问就是*顺便*测试一下三引号最多能塞多少行（~~其实第二天就只记得黄河之水了~~）喵~

---

## 二、变量与类型：贴标签、发身份证

变量就是个贴标签的动作：算好的东西贴个名，之后喊名字就行，不用重新算。

```python
my_love = "张**"
print("我喜欢" + my_love)
```

顺带认识了偷懒神器 `%s` 占位符：`print("你好%s" % my_love)`。后来学了 f-string 就再也没用过它——`f"你好{my_love}"` 直接塞花括号，谁用谁知道喵~

命名三条规矩：字母下划线开头、区分大小写、别拿关键字当名字。本尊一开始非要给变量起名 `class`，被报错当场教做人（~~报错三行长，本尊只看懂了最后那个冒号~~）。

类型这关就是背家谱：`int` 整数、`float` 小数、`str` 字符串、`bool` 只有 True/False 俩兄弟、`None` 空值——注意 None 是"没有"，不是 0 也不是空字符串，别混。拿 `type()` 挨个验一遍，跟体检一样，心里踏实喵~

正事是写了个一元二次方程求根计算器，高中那个 `Δ = b² - 4ac`：

```python
import math
a = float(input("请输入方程简化后a的值:"))
b = float(input("请输入方程简化后b的值:"))
c = float(input("请输入方程简化后c的值:"))
delta = float(b**2 - 4*a*c)
if delta < 0:
    print(f"方程无解")
elif delta == 0:
    x = (-b + math.sqrt(delta)) / (2*a)
    print(f"方程有唯一解:{x:.2f}")
else:
    x1 = (-b + math.sqrt(delta)) / (2*a)
    x2 = (-b - math.sqrt(delta)) / (2*a)
    print(f"方程有2个根为:{x1:.2f}和{x2:.2f}")
```

划重点，三个新手必踩的坑喵~

1. **`**` 是乘方**，`2**3` 是 8 不是 6。本尊第一次写的时候以为它俩是一个意思
2. **input 拿到的一切都是字符串**，不套 `float()` 的话 `"5" * 2` 给你 `"55"` 而不是 10——字符串的乘法就是这么朴实无华且枯燥
3. **`:.2f` 保留两位小数**，直接写在花括号里，比手动 round 优雅

---

## 三、input：程序终于会接话了

之前程序都是自说自话，学了 input 它才开始问本尊话：

```python
age = input("请输入年龄:")
print("你十年后的年龄是:" + str(int(age) + 10) + "岁")
```

看这个套路：`int(age)` 转数字做加法，算完再 `str()` 转回字符串来拼接。**转过去再转回来**——这就是新手期本尊跟类型系统的全部恩怨喵~

练习题里有个算 BMI 的：体重除以身高的平方。当时本尊还不知道，这个公式后面在嵌套条件、函数定义两关反复出场，属于命中注定的数字。

---

## 四、条件语句：哄对象的逻辑学

`if / elif / else` 三件套，程序从此有了眼力见。入门题：

```python
happy = input("你今天开心吗？(y/n)")
if happy == "y":
    print("太好了，祝你开心每一天！")
elif happy == "n":
    print("没关系，明天会更好！")
else:
    print("输入有误，请输入'y'或'n'")
```

然后是重量级选手——**女朋友心情指数判断器**，本尊的嵌套 if 成名作喵~

```python
mood = int(input("请输入女朋友的心情指数(1-100):"))
if mood <= 20:
    if_goout = input("女朋友是否出去玩了？(是/否):")
    if if_goout == "是":
        print("女朋友出去玩了，你可以打游戏了")
    else:
        print("女朋友没有出去玩，你要哄她开心哦")
elif 20 <= mood <= 50:
    print("女朋友心情一般，你可以陪她聊聊天")
```

先吹一个 Python 独有的福利：`20 <= mood <= 50` 可以连写，跟数学课本一模一样，换别的语言得拆成两个条件用 and 连。

逻辑运算那关的题目更狠，"好男朋友考核系统"：

```python
if house_work_count >= 10 and hongbao >= 5 and goshopping_count >= 3 and badmood_count <= 2:
    print("你是一个好男朋友！")
```

四个条件 and 串起来，写完本尊陷入沉思：原来追人的难度是可以量化的。and/or/not 的脾气一句话讲完：**and 全真才真，or 一真即真，not 直接翻面**，完事喵~

### 反面教材：屎山本山

同一个 BMI 分类，本尊留了两个版本。正经版先判性别、再在分支里判 BMI；另一版被本尊自己命名为 `_屎山`：

```python
if gender == "男" and user_BMI < 20:
    ...
elif gender == "男" and 20 <= user_BMI <= 25:
    ...
elif gender == "男" and user_BMI > 25:
    ...
elif gender == "女" and user_BMI < 18:
    ...
```

六个 elif 平铺，每个条件里重复查一遍性别，纯靠硬怼。逻辑没错，能跑，但加一个性别就得复制三行。给文件起名"屎山"的时候本尊已经隐约悟了：**条件能嵌套就别平铺，代码能复用就别复制。**

还有个保命姿势得单拎出来说：try/except。

```python
try:
    user_BMI = float(user_weight) / float(user_height) ** 2
except ValueError:
    print("身高或体重请输入有效的数字")
    exit()
```

用户乱输字母程序原地爆炸？现在会好好说"请输入数字"了。新手期的幸福感，一半来自"程序不再动辄红屏"喵~

---

## 五、列表：购物清单模拟器

`[]` 一框，一串数据排队站好，这就是列表。先做无菜单版：

```python
shopping_list = []
while True:
    add_1 = input("请输入需要添加的购物清单(输入q退出):")
    if add_1 == "q":
        break
    if add_1 == "":
        print("输入不能为空!")
        continue
    shopping_list.append(add_1)
```

break 和 continue 长得像，脾气完全相反：**break 是整个循环报废，continue 是这一轮报废、重开下一轮。**

后来嫌输 q 太糙，升级成菜单版：1 添加、2 查看、3 删除、4 退出。核心三招喵~

```python
for i, item in enumerate(shopping_list, 1):   # enumerate 连号带物，从1开始数
    print(f"{i}.{item}")
shopping_list.pop(remove_num - 1)             # 显示从1开始，下标从0开始，减1换算
try:
    ...
except (ValueError, IndexError):              # 输字母、输超范围编号，一个 except 全兜住
    print(f"输入错误!")
```

enumerate 是本尊的心头好，又拿序号又拿值，一行顶三行。列表家族常用招这关集齐：append 追加、remove 按值删、`[-1]` 倒数第一个、`[1:3]` 切片、len 量身高、sum/max/min/sorted 一条龙，最后 `",".join(list)` 拼回字符串——购物清单的最终归宿是变成一条朋友圈文案喵~

---

## 六、字典：网络流行语查询机

列表是按编号找人，字典是**按名字找人**——键值对 `{"键": "值"}`。这关世界观更新最猛，没有之一。

本尊写了个《2026 网络流行语词典》查询机，收录词条非常严肃：

```python
slang_dict = {
    "奶绿波": "高速堵车/密集事物刷屏梗",
    "龙虾": "AI智能体OpenClaw昵称,高效摸鱼",
    "酸黄瓜": "自嘲普通、收入不高",
    "精神离职": "人在工位，心已辞职",
}
slang_dict["无效加班"] = "加班没产出，纯耗时间"    # 新增词条直接赋值就行
```

功能链条：输入要查的词 → `in` 判断收没收录 → 收录了直接报含义；没收录就打印全部可查词条，再问你要不要现场补录。补录逻辑藏了个双层 while 嵌套，写到后面本尊自己都要画箭头才跟得上自己的流程。

<details>
<summary>下面这段有点绕，不想看可以划走（本尊原谅你）</summary>

第一层 while 等你输入词，第二层 while 等你确认补不补录，跳出条件却写在第一层——本尊现在的解法是拿笔在草稿纸上画箭头，写代码五分钟，画流程图半小时（~~这算加班还是算摸鱼~~）。

</details>

回头看，真正的收获是字典和列表的分工：**有序排队用列表，对号入座用字典。** 后面学类的时候发现 `self.xxx = xxx` 本质也是往一个字典里塞东西——先埋伏笔，第十关揭晓喵~

---

## 七、循环：把重复的活儿丢给电脑

for + range 三兄弟：

```python
for i in range(0, 10):      # 0到9
for i in range(0, 10, 2):   # 偶数
for i in range(1, 10, 2):   # 奇数
```

`range(起点, 终点, 步长)`，重点背三遍：**取到起点，取不到终点**。本尊第一回算 1 加到 100 写成 `range(1, 100)`，少了个 100，对答案对不上的绝望你们懂的。

```python
total = 0
for num in range(1, 101):
    total = total + num
print(total)                 # 5050，高斯看了都说好
```

while 关经典题"输一串数求平均值"，本尊交过两个版本，第二版干净喵~

```python
total = 0
count = 0
i = input("请输入数字(输入q退出):")
while i != "q":
    try:
        total = total + float(i)
        count = count + 1
    except ValueError:
        print(f"请输入数字!")
    i = input("请输入数字(输入q退出):")     # 循环末尾必须再要一次输入，不然死循环伺候
if count == 0:
    result = 0
else:
    result = total / count               # 除法之前先看分母是不是0，
print(f"平均值为{result:.2f}")            # 除零崩溃是本尊的童年阴影
```

还有个体温筛查小程序，字典加循环的第一次会师：

```python
temperature_dict = {"张三": 36.5, "李四": 37.2, "王五": 38.8}
for name, temperature in temperature_dict.items():
    if temperature >= 38:
        print(name, temperature)
```

`.items()` 一个方法同时拆出键和值，一行过完一个部门的体温。本尊盯着屏幕想了三秒：**这不就是本尊以后上班要用的东西吗**喵~

---

## 八、def：把代码折成一把伞

学到函数才真正理解"能复用就别复制"那句话。def 一下，之前一坨流程折起来随身带，用的时候喊名字。

```python
def calculate_BMI(weight, height):
    BMI = weight / (height ** 2)
    if BMI <= 18.5:
        print("偏瘦")
    elif 18.5 < BMI <= 25:
        print("正常")
    elif 25 < BMI <= 30:
        print("偏胖")
    else:
        print("肥胖")
    return BMI
```

宿命数字 BMI 第三次出场，这次它是个函数了。扇形面积计算器同款套路：`def calculate_sector(圆心角, 半径)`，一行公式一行 return。

函数关就一个哲学问题：**print 是演给观众看，return 是把东西交给下一道工序。** 本尊一开始俩混着用，函数里 print 完又 return，外面接住再 print 一遍，同一个数字屏幕上蹦出来两次。这个坑值得单独立块碑喵~

---

## 九、模块：白嫖全世界的代码

import 一打，别人写好的功能直接拿来用。它顺手教会本尊一个美德：**造轮子之前先看看有没有现成的。**

```python
import statistics
print(f"中位数为{statistics.median(num_list)}")
```

中位数这种要排序、分奇偶的活儿，一行搞定。本尊前面还在自己写循环求和呢，人家标准库已经把数学老师半辈子的活干完了喵~

两种引入姿势：`import statistics` 之后用全称 `statistics.median()`，`from statistics import median` 直接喊 `median()`。前者报名字带单位，后者同事之间直呼其名。小项目随意，大项目本尊现在倾向带全称，不然撞名了哭都来不及（这个本尊还没被踩过，先立个 flag）。

---

## 十、类与对象：本尊的猫活了

第十四关开始画风突变。前面写的全是流程，从这里起是**造东西**。

```python
class Cute_cat:
    def __init__(self, name, age, color):
        self.name = name
        self.age = age
        self.color = color
    def speak(self):
        print("喵" * self.age)
    def think(self, content):
        print(f"毛色为{self.color}的小猫{self.name}在思考{content}...")

cat1 = Cute_cat("jojo", 3, "yellow")
cat1.speak()                  # 喵喵喵
cat1.think("你在干什么")       # 毛色为yellow的小猫jojo在思考你在干什么...
```

本尊学会的第一个正式对象，是一只会按年龄叫唤的猫。`"喵" * self.age` 叫几声全由年龄决定，写这行的时候本尊手抖了一下，生怕哪天 age 传个 999。

面向对象三句真言，就靠这只猫悟的喵~：**类是图纸，对象是成品，self 就是"这只猫自己"**。`__init__` 是出生仪式，方法第一个参数必须留给 self——不然猫分不清哪份数据是自己的。

实战题是学生成绩系统，第一次体会到"数据和对它做的事锁在一起"的爽：

```python
class Student:
    def __init__(self, name, student_id):
        self.name = name
        self.student_id = student_id
        self.grade = {"语文": 0, "数学": 0, "英语": 0}
    def set_grade(self, course, grade):
        if course in self.grade:
            self.grade[course] = grade
    def get_grade(self):
        for course in self.grade:
            print(f"{course}:{self.grade[course]}分")
```

每个 student 对象自带一本字典成绩单，互不串数据。小张同学英语 20 分这件事锁在他的 self.grade 里，谁也抢不走（这就是他的真实水平，~~本尊替他求个情~~别骂了喵~）

---

## 十一、继承：父类打底，子类干活

类的进阶玩法——**父类写通用的，子类只写自己多出来的**：

```python
class mammal:
    def __init__(self, name, sex):
        self.name = name
        self.sex = sex
        self.num_eyes = 2
    def breath(self):
        print(self.name + "在呼吸...")
    def poop(self):
        print(self.name + "在拉屎...")

class human(mammal):
    def play(self):
        print(self.name + "在玩手机")
```

哺乳动物负责呼吸和拉屎，人类只需要额外学一个玩手机。继承这关本尊的名言：**抽象的尽头是复制粘贴的终结。**

练习题是员工工资系统：全职按月薪算，兼职按日薪乘天数算，都从父类 `super().__init__()` 领名字和工号，各自实现同名方法 `calculate_monthly_pay()`：

```python
class Fulltimeemployee(Employee):
    def calculate_monthly_pay(self):
        return self.monthly_salary

class Parttimeemployee(Employee):
    def calculate_monthly_pay(self):
        return self.daily_salary * self.work_days
```

同一个调用姿势，不同员工算出不同的账。后来本尊才知道这玩法有个专业名词叫多态，当时第一反应是：**原来面试官问的八股，本尊拿摸鱼系统提前写过了**喵~

---

## 十二、读文件：代码终于留下了存档

最后一关，把之前存在代码里、一关机就蒸发的数据，从 txt 里捞出来：

```python
f = open("./file/data.txt", "r", encoding="utf-8")
for content in f.readlines():
    print(content, end="")
f.close()
```

两个保命符看好了喵~

- `encoding="utf-8"` 不加，中文读出来全是乱码天书
- `end=""` 不加，readlines 每行自带换行符，print 再送你一个，输出双倍行距、隔行如隔山

还有个更文明的 `with open(...)` 写法，退出代码块自动关门，本尊注释里留着两行没用上（with 的好处是忘关文件也不泄漏资源，道理本尊懂，但 `f.close()` 亲手关才有仪式感，别问，问就是玄学）。

执行完毕后，大功告成——十六关全部通关。从打印一句 Hello 到能读写文件，程序终于从"一次性玩具"进化成"有存档的游戏"喵~

---

## 十三、血泪浓缩：零基础到底难不难

不难，但全是细碎的坑。两个多月浓缩成六条，零基础照单全收能少走一半弯路：

1. **报错红字先看最后一行**。Python 想说的话基本都写在最后一句，剩下的是它的心理活动
2. **input 拿到的全是字符串**。要算数先 int()/float()，本尊在这上面跌倒的次数铺开能垫平整个机房
3. **range 取头不取尾**。永远记得
4. **除之前先想分母能不能为 0**。count == 0 的分支不是摆设
5. **同一练习多写几版很正常**。屎山版和嵌套版并存，丑的那版教会本尊的反而更多
6. **每关必须写一个"自己的"小程序**。流行语词典、体温筛查、猫猫养成器——练习名字越不正经，记得越牢喵~

下一步计划：把文件读写和字典结合，给流行语查询机加存档，查询记录写进 txt，下次开机词条还在。然后继续往异常处理和综合小项目啃（大概）。

---

## 说明与反馈

- 本文是学习记录不是教程，代码全部出自编号 1 到 16 的作业文件，水平有限，写法未必标准，轻喷喵~
- 所有示例可直接复制运行，环境 Python 3，零第三方库
- 有更优雅的写法欢迎交流：**support@lonelybing.top**
- 本系列跟学习进度持续更新，下一章预定：异常处理与综合小项目

就这样。两个多月前本尊连引号都会打错，现在本尊的猫已经会思考人生了。零基础这个东西，翻过一页就不存在了喵~
